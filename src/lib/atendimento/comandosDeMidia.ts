// Arquivos, modelos da Meta e o convite para o portal (11/11/2026).

import { randomBytes } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { nomeExibicao } from "@/lib/companyName";
import type { Contexto } from "./contexto";
import { ehDaTriagem, podeConfigurar, podeResponder, podeVerCiclo } from "./acesso";
import { alvo, carregar, exigir, nomeDoUsuario, rotuloDoSetor } from "./comandos";
import { arquivosDoAtendimento } from "./midia";
import { assinaturaDe, nomeDeModeloValido, parametrosDoModelo, textoDoModelo, variaveisDoModelo } from "./regras";
import { conexaoPeloId, enviarArquivoNoAtendimento, enviarModeloNoAtendimento, enviarNoAtendimento, podeEnviarNaConversa } from "./transporte";

const MAX_LEGENDA = 1_000;

async function assinaturaDaPessoa(c: Contexto, setor: string | null) {
  return assinaturaDe(await nomeDoUsuario(c.ctx.tenantId, c.ctx.userId), await rotuloDoSetor(c.ctx.tenantId, setor ?? c.cfg.triagem));
}

// ─── Arquivo ─────────────────────────────────────────────────────────────────

export async function enviarArquivo(c: Contexto, cicloId: string, arquivo: File, legenda: string) {
  const ciclo = await carregar(c, cicloId);
  exigir(podeResponder(c.ctx, c.cfg, alvo(ciclo)), "Assuma a conversa para enviar arquivos.");
  const conexao = await conexaoPeloId(c.ctx.tenantId, ciclo.conversa.integrationId);
  exigir(!!conexao, "O número do escritório está desconectado.");
  exigir(!!conexao.provedor.enviarMidia, "Este número não manda arquivos.");
  const pode = podeEnviarNaConversa(ciclo.conversa, conexao.provedor, new Date());
  exigir(pode.ok, pode.ok ? "" : pode.motivo);
  exigir(legenda.length <= MAX_LEGENDA, "Legenda longa demais.");

  const g = await arquivosDoAtendimento.gravarAnexos(c.ctx.tenantId, [arquivo]);
  exigir(g.ok, g.ok ? "" : g.erro);
  const a = g.anexos[0]!;
  const bytes = await arquivosDoAtendimento.lerAnexo(a.fileUrl);
  exigir(!!bytes, "Não deu para ler o arquivo guardado. Tente de novo.");

  const r = await enviarArquivoNoAtendimento({
    tenantId: c.ctx.tenantId,
    conversaId: ciclo.conversaId,
    cicloId: ciclo.id,
    waPhone: ciclo.conversa.waPhone,
    conexao,
    arquivo: { bytes, fileUrl: a.fileUrl, fileName: a.fileName, mimeType: a.mimeType },
    legenda: legenda.trim(),
    assinatura: await assinaturaDaPessoa(c, ciclo.sectorCode),
    senderUserId: c.ctx.userId,
  });
  if (r.ok && ciclo.situacao === "EM_ATENDIMENTO") {
    await getPrisma().atendimentoCiclo.update({ where: { id: ciclo.id }, data: { situacao: "AGUARDANDO_CLIENTE" } });
  }
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.arquivo", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { arquivo: a.fileName, ok: r.ok } });
  exigir(r.ok, r.ok ? "" : `O arquivo não saiu: ${r.erro}`);
}

/** Para a rota de download: a mensagem com arquivo, se a pessoa pode ver a conversa. */
export async function arquivoDaMensagem(c: Contexto, mensagemId: string) {
  const prisma = getPrisma();
  const m = await prisma.atendimentoMensagem.findFirst({
    where: { id: mensagemId, tenantId: c.ctx.tenantId, midiaPath: { not: null } },
    select: { midiaPath: true, midiaNome: true, midiaMime: true, conversaId: true, cicloId: true },
  });
  if (!m?.midiaPath) return null;
  // Quem vê qualquer ciclo da conversa vê os arquivos dela: a conversa é uma só.
  const ciclos = await prisma.atendimentoCiclo.findMany({
    where: { conversaId: m.conversaId, tenantId: c.ctx.tenantId },
    select: { sectorCode: true, assignedToId: true, situacao: true },
  });
  if (!ciclos.some((x) => podeVerCiclo(c.ctx, c.cfg, alvo(x)))) return null;
  const bytes = await arquivosDoAtendimento.lerAnexo(m.midiaPath);
  if (!bytes) return null;
  return { bytes, nome: m.midiaNome ?? "arquivo", mime: m.midiaMime ?? "application/octet-stream" };
}

// ─── Modelos da Meta ─────────────────────────────────────────────────────────

export async function retomarConversa(c: Contexto, cicloId: string, modeloId: string, preenchidos: string[]) {
  const ciclo = await carregar(c, cicloId);
  exigir(podeResponder(c.ctx, c.cfg, alvo(ciclo)), "Assuma a conversa para retomar.");
  exigir(!ciclo.conversa.optedOutAt, "O cliente pediu para parar de receber mensagens.");
  const modelo = await getPrisma().atendimentoModelo.findFirst({ where: { id: modeloId, tenantId: c.ctx.tenantId, ativo: true } });
  exigir(!!modelo, "Escolha um modelo da lista.");
  const conexao = await conexaoPeloId(c.ctx.tenantId, ciclo.conversa.integrationId);
  exigir(!!conexao, "O número do escritório está desconectado.");

  const assinatura = await assinaturaDaPessoa(c, ciclo.sectorCode);
  const parametros = parametrosDoModelo(modelo.texto, assinatura, preenchidos.map((p) => p.slice(0, 200)));
  const textoPreenchido = textoDoModelo(modelo.texto, parametros);
  const r = await enviarModeloNoAtendimento({
    tenantId: c.ctx.tenantId,
    conversaId: ciclo.conversaId,
    cicloId: ciclo.id,
    waPhone: ciclo.conversa.waPhone,
    conexao,
    modelo,
    parametros,
    textoPreenchido,
    assinatura,
    senderUserId: c.ctx.userId,
  });
  if (r.ok && ciclo.situacao === "EM_ATENDIMENTO") {
    await getPrisma().atendimentoCiclo.update({ where: { id: ciclo.id }, data: { situacao: "AGUARDANDO_CLIENTE" } });
  }
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.retomar", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { modelo: modelo.nomeNaMeta, ok: r.ok } });
  exigir(r.ok, r.ok ? "" : `O modelo não saiu: ${r.erro}`);
}

export async function salvarModelo(c: Contexto, p: { id: string | null; rotulo: string; nomeNaMeta: string; idioma: string; texto: string; ativo: boolean }) {
  exigir(podeConfigurar(c.ctx, c.cfg), "Só o administrador ou o gestor da triagem cadastra modelos.");
  const rotulo = p.rotulo.trim();
  const nomeNaMeta = p.nomeNaMeta.trim();
  const idioma = p.idioma.trim() || "pt_BR";
  const texto = p.texto.trim();
  exigir(rotulo.length > 0 && rotulo.length <= 80, "O nome do modelo tem de 1 a 80 caracteres.");
  exigir(nomeDeModeloValido(nomeNaMeta), "O nome na Meta usa só minúsculas, números e _ (como foi aprovado lá).");
  exigir(/^[a-z]{2}(_[A-Z]{2})?$/.test(idioma), "Idioma no formato da Meta, como pt_BR.");
  exigir(texto.length > 0 && texto.length <= 1024, "Cole o texto do modelo como foi aprovado na Meta.");
  exigir(variaveisDoModelo(texto) >= 1, "O modelo precisa do {{1}}, que recebe a assinatura de quem manda.");
  const prisma = getPrisma();
  if (p.id) {
    const atual = await prisma.atendimentoModelo.findFirst({ where: { id: p.id, tenantId: c.ctx.tenantId } });
    exigir(!!atual, "Modelo não encontrado.");
    await prisma.atendimentoModelo.update({ where: { id: p.id }, data: { rotulo, nomeNaMeta, idioma, texto, ativo: p.ativo } });
    await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.modelo.editar", entityType: "AtendimentoModelo", entityId: p.id });
  } else {
    const m = await prisma.atendimentoModelo.create({ data: { tenantId: c.ctx.tenantId, rotulo, nomeNaMeta, idioma, texto, ativo: p.ativo } });
    await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.modelo.criar", entityType: "AtendimentoModelo", entityId: m.id });
  }
}

export async function removerModelo(c: Contexto, id: string) {
  exigir(podeConfigurar(c.ctx, c.cfg), "Só o administrador ou o gestor da triagem remove modelos.");
  const prisma = getPrisma();
  const atual = await prisma.atendimentoModelo.findFirst({ where: { id, tenantId: c.ctx.tenantId } });
  exigir(!!atual, "Modelo não encontrado.");
  await prisma.atendimentoModelo.delete({ where: { id } });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.modelo.remover", entityType: "AtendimentoModelo", entityId: id, metadata: { rotulo: atual.rotulo } });
}

// ─── Convite para o portal ───────────────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cria o acesso do cliente ao portal, ligado à empresa do contato, e manda o
 * link de definir a senha pela conversa. O acesso nasce sem senha conhecida,
 * como no cadastro de Configurações › Portal: o cliente define pelo link.
 *
 * E-mail que já tem acesso ativo: a empresa é ligada a ele, e vai um link novo.
 * Acesso desativado com o e-mail: recusa, para reativar em Configurações.
 *
 * Só a triagem convida: dar acesso a alguém de fora é decisão do atendimento do escritório.
 */
export async function convidarParaOPortal(c: Contexto, p: { cicloId: string; nome: string; email: string }) {
  const ciclo = await carregar(c, p.cicloId);
  exigir(ehDaTriagem(c.ctx, c.cfg) && !c.ctx.subscriptionReadOnly && c.ctx.role !== "READONLY", "Só a triagem convida para o portal.");
  exigir(ciclo.situacao !== "ENCERRADO", "O atendimento está encerrado.");
  const companyId = ciclo.conversa.contato.companyId;
  exigir(!!companyId, "Ligue o contato a uma empresa antes de convidar.");
  const nome = p.nome.trim().slice(0, 120);
  const email = p.email.trim().toLowerCase();
  exigir(nome.length > 0, "Escreva o nome de quem vai acessar.");
  exigir(EMAIL.test(email) && email.length <= 120, "Confira o e-mail.");

  const conexao = await conexaoPeloId(c.ctx.tenantId, ciclo.conversa.integrationId);
  exigir(!!conexao, "O número do escritório está desconectado.");
  const pode = podeEnviarNaConversa(ciclo.conversa, conexao.provedor, new Date());
  exigir(pode.ok, pode.ok ? "" : pode.motivo);

  const prisma = getPrisma();
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId: c.ctx.tenantId }, select: { id: true, name: true, displayName: true } });
  exigir(!!empresa, "Empresa não encontrada.");

  const existente = await prisma.portalUser.findFirst({ where: { tenantId: c.ctx.tenantId, email }, select: { id: true, active: true } });
  let portalUserId: string;
  if (existente) {
    exigir(existente.active, "Esse e-mail tem um acesso desativado. Reative em Configurações › Portal do cliente.");
    await prisma.portalUserCompany.createMany({
      data: [{ tenantId: c.ctx.tenantId, portalUserId: existente.id, companyId: empresa.id, incluiFiliais: true }],
      skipDuplicates: true,
    });
    portalUserId = existente.id;
  } else {
    try {
      const criado = await prisma.portalUser.create({
        data: {
          tenantId: c.ctx.tenantId,
          name: nome,
          email,
          passwordHash: await hashPassword(randomBytes(32).toString("hex")),
          empresas: { create: [{ tenantId: c.ctx.tenantId, companyId: empresa.id, incluiFiliais: true }] },
        },
        select: { id: true },
      });
      portalUserId = criado.id;
    } catch (err) {
      if (isPrismaUniqueError(err)) throw new Error("Acabou de ser criado um acesso com este e-mail. Tente de novo.");
      throw err;
    }
    await logAudit({
      tenantId: c.ctx.tenantId,
      userId: c.ctx.userId,
      action: "portal.user.created",
      entityType: "PortalUser",
      entityId: portalUserId,
      metadata: { nome, email, empresas: [{ id: empresa.id, nome: nomeExibicao(empresa), incluiFiliais: true }], origem: "atendimento" },
    });
  }

  const token = await createPasswordResetToken(portalUserId, "PORTAL_USER");
  const base = (process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "");
  const link = `${base}/portal/redefinir-senha?token=${token}`;
  const primeiro = nome.split(/\s+/)[0];
  const texto =
    `${primeiro}, criei seu acesso ao portal da 41 para a ${nomeExibicao(empresa)}. ` +
    `Por lá você manda documentos, abre solicitações e vê suas guias.\n\n` +
    `Defina sua senha por este link (vale por 1 hora): ${link}\n\nSeu login é ${email}.`;
  const r = await enviarNoAtendimento({
    tenantId: c.ctx.tenantId,
    conversaId: ciclo.conversaId,
    cicloId: ciclo.id,
    waPhone: ciclo.conversa.waPhone,
    conexao,
    texto,
    assinatura: await assinaturaDaPessoa(c, ciclo.sectorCode),
    senderUserId: c.ctx.userId,
  });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.convite", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { email, empresa: empresa.id, ok: r.ok } });
  exigir(r.ok, r.ok ? "" : `O acesso foi criado, mas a mensagem não saiu: ${r.erro}. Mande o link de novo por Configurações › Portal do cliente.`);
}
