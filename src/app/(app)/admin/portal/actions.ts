"use server";

// Os acessos ao portal do cliente, do lado do escritório: Administração ›
// Portal do cliente e a aba "Acesso ao portal" da ficha da empresa usam as
// mesmas ações.
//
// Desde 14/10/2026 (etapa 2 da saída do Cliente) o acesso é ligado direto a N
// empresas, com "incluir filiais" (marcado por padrão — decisão do Kauan,
// 13/10). Conta nova nasce sem Cliente. Criar, editar, ligar e desligar
// empresa seguem a permissão de sempre do admin do portal (`isFullWrite`);
// excluir é só administrador (`podeExcluir`).

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, podeExcluir } from "@/lib/auth/context";
import { logAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { createPasswordResetToken } from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/email/sendMail";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { apagarTutoriaisDoPortal } from "@/lib/tutorial/vistos";
import { nomeExibicao } from "@/lib/companyName";
import {
  CONTAGEM_DO_ACESSO,
  confirmacaoConfere,
  resumirHistoricoDoAcesso,
  type HistoricoDoAcesso,
} from "@/lib/exclusaoConfirmada";
import { listaDeNomes, mensagemDoEmailRepetido, type AcessoExistente } from "@/lib/portal/acessoExistente";
import {
  FALTA_ATUALIZAR_O_BANCO_DO_PORTAL,
  empresasLigadasDasContas,
  idsDasEmpresasDaConta,
  portalPorEmpresaPronto,
  type BancoDoPortal,
  type EmpresaLigada,
} from "@/lib/portal/empresasDaContaDb";

/**
 * O retorno dos formulários de acesso. `existente` vem quando o e-mail já tem
 * acesso — a tela diz de quem é, em que situação está, e oferece o caminho
 * (ver lib/portal/acessoExistente).
 */
export type EstadoDoAcesso =
  | { erro: string; existente?: AcessoExistente }
  | { ok: true; aviso?: string; mensagem?: string }
  | null;

/** O retorno das ações de um clique (ligar, desligar, filiais). */
export type ResultadoDoAcesso = { erro: string } | { ok: true; mensagem: string };

type Contexto = { tenantId: string; userId: string };
type EscolhaDeEmpresa = { companyId: string; incluiFiliais: boolean };
type EmpresaEscolhida = EscolhaDeEmpresa & { nome: string };
type ContaComEmail = { id: string; name: string; active: boolean; existente: AcessoExistente };

/**
 * As empresas escolhidas no formulário: um JSON `[{ companyId, incluiFiliais }]`
 * no campo `empresas`. Sem "incluiFiliais", vale marcado (o padrão).
 */
function lerEmpresas(bruto: FormDataEntryValue | null): EscolhaDeEmpresa[] {
  let lista: unknown;
  try {
    lista = JSON.parse(String(bruto ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(lista)) return [];
  const vistas = new Map<string, EscolhaDeEmpresa>();
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const { companyId, incluiFiliais } = item as { companyId?: unknown; incluiFiliais?: unknown };
    if (typeof companyId !== "string" || !companyId) continue;
    vistas.set(companyId, { companyId, incluiFiliais: incluiFiliais !== false });
  }
  return [...vistas.values()].slice(0, 500);
}

function lerCampos(form: FormData) {
  return {
    nome: String(form.get("nome") ?? "").trim().slice(0, 120),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    empresas: lerEmpresas(form.get("empresas")),
  };
}

function validarCampos(c: ReturnType<typeof lerCampos>): string | null {
  if (!c.nome) return "Informe o nome.";
  if (!c.email.includes("@") || c.email.length > 120) return "E-mail inválido.";
  if (c.empresas.length === 0) return "Escolha ao menos uma empresa que esta conta enxerga.";
  return null;
}

/**
 * As empresas do formulário, só se forem todas deste escritório: o id vem do
 * navegador, e sem esta conferência um id de outro escritório daria a um
 * cliente acesso às empresas de lá.
 */
async function empresasDoEscritorio(tenantId: string, escolhas: EscolhaDeEmpresa[]): Promise<EmpresaEscolhida[] | null> {
  const achadas = await getPrisma().company.findMany({
    where: { tenantId, id: { in: escolhas.map((e) => e.companyId) } },
    select: { id: true, name: true, displayName: true },
  });
  if (achadas.length !== escolhas.length) return null;
  const nome = new Map(achadas.map((e) => [e.id, nomeExibicao(e)]));
  return escolhas.map((e) => ({ ...e, nome: nome.get(e.companyId)! }));
}

async function ligadasDaConta(tenantId: string, id: string): Promise<EmpresaLigada[]> {
  return (await empresasLigadasDasContas(tenantId, [{ id, clientGroupId: null }])).get(id) ?? [];
}

/** O acesso que já usa o e-mail, com as empresas dele — para a tela dizer de quem é. */
async function acessoComEmail(tenantId: string, email: string): Promise<ContaComEmail | null> {
  const conta = await getPrisma().portalUser.findFirst({ where: { tenantId, email }, select: { id: true, name: true, active: true } });
  if (!conta) return null;
  const ligadas = await ligadasDaConta(tenantId, conta.id);
  return {
    ...conta,
    existente: {
      id: conta.id,
      nome: conta.name,
      email,
      ativo: conta.active,
      empresaIds: ligadas.map((e) => e.id),
      empresas: ligadas.map((e) => e.nome),
    },
  };
}

/** A ficha de toda empresa e a lista de acessos: o acesso aparece nas duas. */
function revalidar() {
  revalidatePath("/admin/portal");
  revalidatePath("/empresas/[id]", "page");
}

/**
 * Desliga os limites de aprovação que a conta tem em empresas que ela não
 * enxerga mais. Sem isto, se uma dessas empresas voltasse para o acesso, a
 * pessoa ganharia de volta, sem ninguém decidir, o poder de aprovar pagamento
 * nela. Desligar, não apagar: o limite explica quem pôde aprovar o que já foi
 * aprovado (mesma regra de `alternarAlcada`).
 */
async function desligarAlcadasForaDoAlcance(tx: BancoDoPortal, tenantId: string, portalUserId: string): Promise<number> {
  const alcance = await idsDasEmpresasDaConta(tenantId, portalUserId, tx);
  const r = await tx.portalApprovalLimit.updateMany({
    where: { tenantId, portalUserId, active: true, companyId: { notIn: alcance } },
    data: { active: false },
  });
  return r.count;
}

/** Uma linha de auditoria por empresa ligada ou desligada: quem procura a empresa acha. */
async function auditarEmpresas(
  ctx: Contexto,
  conta: { id: string; nome: string },
  mudancas: { ligadas?: EmpresaEscolhida[]; desligadas?: { id: string; nome: string }[]; filiais?: EmpresaEscolhida[] }
) {
  for (const e of mudancas.ligadas ?? []) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "portal.user.company.linked",
      entityType: "PortalUser",
      entityId: conta.id,
      metadata: { nome: conta.nome, empresa: { id: e.companyId, nome: e.nome }, incluiFiliais: e.incluiFiliais },
    });
  }
  for (const e of mudancas.desligadas ?? []) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "portal.user.company.unlinked",
      entityType: "PortalUser",
      entityId: conta.id,
      metadata: { nome: conta.nome, empresa: { id: e.id, nome: e.nome } },
    });
  }
  for (const e of mudancas.filiais ?? []) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "portal.user.company.filiais",
      entityType: "PortalUser",
      entityId: conta.id,
      metadata: { nome: conta.nome, empresa: { id: e.companyId, nome: e.nome }, incluiFiliais: e.incluiFiliais },
    });
  }
}

/**
 * Cria um acesso de cliente ao portal, já ligado às empresas escolhidas.
 *
 * **Nasce sem senha conhecida**, igual à importação de usuários de 03/09: uma
 * senha aleatória é gerada, cifrada e descartada dentro deste processo. Não
 * existe senha padrão, e ninguém — nem quem cria — sabe qual é. O cliente entra
 * pelo link de definição de senha, que vai por e-mail.
 *
 * **Nasce sem Cliente** (14/10/2026): o que a conta vê são as empresas ligadas
 * a ela.
 *
 * E-mail repetido (13/10/2026): o e-mail é único por escritório, inclusive
 * entre os desativados. Em vez de recusar sem explicar, a resposta diz de quem
 * é o acesso e em que situação ele está — e o formulário oferece
 * reaproveitá-lo (botão com `name="reaproveitar"`, que volta para esta mesma
 * action com os campos como estão na tela).
 *
 * Só `isFullWrite`: dar acesso a alguém de fora da 41 não é operação de setor.
 */
export async function criarAcessoDoPortal(_anterior: EstadoDoAcesso, form: FormData): Promise<EstadoDoAcesso> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Sem permissão." };

  const campos = lerCampos(form);
  const invalido = validarCampos(campos);
  if (invalido) return { erro: invalido };
  const { nome, email } = campos;

  if (!(await portalPorEmpresaPronto())) return { erro: FALTA_ATUALIZAR_O_BANCO_DO_PORTAL };
  const empresas = await empresasDoEscritorio(ctx.tenantId, campos.empresas);
  if (!empresas) return { erro: "Empresa não encontrada." };

  const jaExiste = await acessoComEmail(ctx.tenantId, email);

  const reaproveitar = String(form.get("reaproveitar") ?? "");
  if (reaproveitar) {
    // O id veio da resposta anterior; se o e-mail agora é de outro acesso (ou
    // de nenhum), a pessoa estaria confirmando algo que não viu.
    if (!jaExiste || jaExiste.id !== reaproveitar) {
      return { erro: "Este acesso mudou enquanto a janela estava aberta. Feche e tente de novo." };
    }
    return reaproveitarAcesso(ctx, jaExiste, { nome, email, empresas });
  }

  if (jaExiste) {
    return { erro: mensagemDoEmailRepetido(jaExiste.existente, empresas.map((e) => ({ id: e.companyId }))), existente: jaExiste.existente };
  }

  const prisma = getPrisma();
  let criadoId: string;
  try {
    const criado = await prisma.portalUser.create({
      data: {
        tenantId: ctx.tenantId,
        name: nome,
        email,
        passwordHash: await hashPassword(randomBytes(32).toString("hex")),
        empresas: {
          create: empresas.map((e) => ({ tenantId: ctx.tenantId, companyId: e.companyId, incluiFiliais: e.incluiFiliais })),
        },
      },
      select: { id: true },
    });
    criadoId = criado.id;
  } catch (err) {
    // Duas pessoas criando o mesmo e-mail ao mesmo tempo: a conferência acima
    // passou para as duas, e o índice único barrou a segunda.
    if (isPrismaUniqueError(err)) return { erro: "Acabou de ser criado um acesso com este e-mail. Feche a janela e confira a lista." };
    throw err;
  }

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "portal.user.created",
    entityType: "PortalUser",
    entityId: criadoId,
    metadata: { nome, email, empresas: empresas.map((e) => ({ id: e.companyId, nome: e.nome, incluiFiliais: e.incluiFiliais })) },
  });

  revalidar();

  const enviado = await enviarLinkDeSenhaInterno(ctx.tenantId, criadoId, email);
  return enviado
    ? { ok: true }
    : {
        ok: true,
        aviso: "Acesso criado, mas o e-mail não saiu (SMTP do workspace). Use “Enviar link” depois de configurar.",
      };
}

/**
 * Reaproveita o acesso que já tinha o e-mail (regra em lib/portal/acessoExistente):
 * - ativo: liga a ele as empresas escolhidas, sem tirar as que ele já vê;
 * - desativado: volta a funcionar com o nome digitado e SÓ as escolhidas — as
 *   empresas que tinha antes saem, e os limites de aprovação nelas são
 *   desligados.
 */
async function reaproveitarAcesso(
  ctx: Contexto,
  conta: ContaComEmail,
  pedido: { nome: string; email: string; empresas: EmpresaEscolhida[] }
): Promise<EstadoDoAcesso> {
  const prisma = getPrisma();
  const tinha = new Set(conta.existente.empresaIds);

  if (conta.active) {
    const faltam = pedido.empresas.filter((e) => !tinha.has(e.companyId));
    if (faltam.length === 0) return { erro: mensagemDoEmailRepetido(conta.existente, pedido.empresas.map((e) => ({ id: e.companyId }))) };
    await prisma.portalUserCompany.createMany({
      data: faltam.map((e) => ({ tenantId: ctx.tenantId, portalUserId: conta.id, companyId: e.companyId, incluiFiliais: e.incluiFiliais })),
      skipDuplicates: true,
    });
    await auditarEmpresas(ctx, { id: conta.id, nome: conta.name }, { ligadas: faltam });
    revalidar();
    return { ok: true, mensagem: `${conta.name} passa a ver também ${listaDeNomes(faltam.map((e) => e.nome))}.` };
  }

  const escolhidas = new Set(pedido.empresas.map((e) => e.companyId));
  const saem = (await ligadasDaConta(ctx.tenantId, conta.id)).filter((e) => !escolhidas.has(e.id));
  const alcadasDesligadas = await prisma.$transaction(async (tx) => {
    await tx.portalUser.update({ where: { id: conta.id }, data: { name: pedido.nome, active: true } });
    await tx.portalUserCompany.deleteMany({ where: { tenantId: ctx.tenantId, portalUserId: conta.id, companyId: { notIn: [...escolhidas] } } });
    for (const e of pedido.empresas) {
      await tx.portalUserCompany.upsert({
        where: { portalUserId_companyId: { portalUserId: conta.id, companyId: e.companyId } },
        create: { tenantId: ctx.tenantId, portalUserId: conta.id, companyId: e.companyId, incluiFiliais: e.incluiFiliais },
        update: { incluiFiliais: e.incluiFiliais },
      });
    }
    return desligarAlcadasForaDoAlcance(tx, ctx.tenantId, conta.id);
  });

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "portal.user.enabled",
    entityType: "PortalUser",
    entityId: conta.id,
    metadata: {
      email: pedido.email,
      nomeAnterior: conta.name,
      nome: pedido.nome,
      reativado: true,
      empresasAntes: conta.existente.empresas,
      empresas: pedido.empresas.map((e) => e.nome),
      alcadasDesligadas,
    },
  });
  await auditarEmpresas(
    ctx,
    { id: conta.id, nome: pedido.nome },
    { ligadas: pedido.empresas.filter((e) => !tinha.has(e.companyId)), desligadas: saem }
  );
  revalidar();

  // Estava desativado: a pessoa pode nem lembrar a senha. Vai o mesmo link
  // do acesso novo, que é o que a janela de "Novo acesso" promete.
  const enviado = await enviarLinkDeSenhaInterno(ctx.tenantId, conta.id, pedido.email);
  return enviado
    ? { ok: true, mensagem: "Acesso reativado. Link de senha enviado." }
    : { ok: true, aviso: "Acesso reativado, mas o e-mail não saiu (SMTP do workspace). Use “Enviar link” depois de configurar." };
}

/**
 * Edita nome, e-mail e empresas de um acesso. As empresas da janela substituem
 * as ligadas direto (as que vêm pela matriz seguem a matriz). Empresa que sai
 * leva junto o limite de aprovação que a pessoa tinha nela (desligado, não
 * apagado). A pessoa não precisa entrar de novo: o portal lê as empresas a
 * cada tela.
 */
export async function editarAcessoDoPortal(_anterior: EstadoDoAcesso, form: FormData): Promise<EstadoDoAcesso> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Sem permissão." };

  const id = String(form.get("id") ?? "");
  const campos = lerCampos(form);
  const invalido = validarCampos(campos);
  if (invalido) return { erro: invalido };
  const { nome, email } = campos;

  if (!(await portalPorEmpresaPronto())) return { erro: FALTA_ATUALIZAR_O_BANCO_DO_PORTAL };
  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { id: true, name: true, email: true } });
  if (!conta) return { erro: "Acesso não encontrado." };

  const empresas = await empresasDoEscritorio(ctx.tenantId, campos.empresas);
  if (!empresas) return { erro: "Empresa não encontrada." };

  if (email !== conta.email) {
    const outro = await acessoComEmail(ctx.tenantId, email);
    if (outro && outro.id !== conta.id) {
      const ve = outro.existente.empresas.length > 0 ? `, que vê ${listaDeNomes(outro.existente.empresas)}` : "";
      return {
        erro: `O e-mail ${email} já é de outro acesso: ${outro.name} (${outro.active ? "ativo" : "desativado"}${ve}). Cada e-mail tem um acesso só.`,
      };
    }
  }

  const antes = await ligadasDaConta(ctx.tenantId, conta.id);
  const porId = new Map(antes.map((e) => [e.id, e]));
  const escolhidas = new Set(empresas.map((e) => e.companyId));
  const saem = antes.filter((e) => !escolhidas.has(e.id));
  const entram = empresas.filter((e) => !porId.has(e.companyId));
  const filiaisMudaram = empresas.filter((e) => porId.has(e.companyId) && porId.get(e.companyId)!.incluiFiliais !== e.incluiFiliais);

  let alcadasDesligadas = 0;
  try {
    alcadasDesligadas = await prisma.$transaction(async (tx) => {
      await tx.portalUser.update({ where: { id: conta.id }, data: { name: nome, email } });
      if (saem.length > 0) {
        await tx.portalUserCompany.deleteMany({ where: { tenantId: ctx.tenantId, portalUserId: conta.id, companyId: { in: saem.map((e) => e.id) } } });
      }
      for (const e of [...entram, ...filiaisMudaram]) {
        await tx.portalUserCompany.upsert({
          where: { portalUserId_companyId: { portalUserId: conta.id, companyId: e.companyId } },
          create: { tenantId: ctx.tenantId, portalUserId: conta.id, companyId: e.companyId, incluiFiliais: e.incluiFiliais },
          update: { incluiFiliais: e.incluiFiliais },
        });
      }
      return desligarAlcadasForaDoAlcance(tx, ctx.tenantId, conta.id);
    });
  } catch (err) {
    if (isPrismaUniqueError(err)) return { erro: `O e-mail ${email} acabou de ser usado em outro acesso.` };
    throw err;
  }

  if (nome !== conta.name || email !== conta.email) {
    await logAudit({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      action: "portal.user.updated",
      entityType: "PortalUser",
      entityId: conta.id,
      metadata: { antes: { nome: conta.name, email: conta.email }, depois: { nome, email } },
    });
  }
  await auditarEmpresas(ctx, { id: conta.id, nome }, { ligadas: entram, desligadas: saem, filiais: filiaisMudaram });
  revalidar();

  if (saem.length === 0) return { ok: true, mensagem: "Acesso atualizado." };
  const limites =
    alcadasDesligadas > 0
      ? ` ${alcadasDesligadas === 1 ? "Um limite" : `${alcadasDesligadas} limites`} de aprovação de pagamento ${alcadasDesligadas === 1 ? "foi desligado" : "foram desligados"}.`
      : "";
  return { ok: true, mensagem: `Acesso atualizado. ${nome} deixa de ver ${listaDeNomes(saem.map((e) => e.nome))}.${limites}` };
}

/** Confere a conta e a empresa no escritório de quem pede. */
async function contaEEmpresa(tenantId: string, portalUserId: string, companyId: string) {
  const prisma = getPrisma();
  const [conta, empresa] = await Promise.all([
    prisma.portalUser.findFirst({ where: { id: portalUserId, tenantId }, select: { id: true, name: true } }),
    prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true, name: true, displayName: true } }),
  ]);
  return conta && empresa ? { conta, empresa: { id: empresa.id, nome: nomeExibicao(empresa) } } : null;
}

/**
 * Liga uma empresa a um acesso que já existe — o "Ligar acesso existente" da
 * ficha da empresa —, ou muda o "incluir filiais" de uma ligação.
 */
export async function ligarEmpresaAoAcesso(portalUserId: string, companyId: string, incluiFiliais: boolean): Promise<ResultadoDoAcesso> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Sem permissão." };
  if (!(await portalPorEmpresaPronto())) return { erro: FALTA_ATUALIZAR_O_BANCO_DO_PORTAL };

  const achados = await contaEEmpresa(ctx.tenantId, portalUserId, companyId);
  if (!achados) return { erro: "Acesso ou empresa não encontrado." };
  const { conta, empresa } = achados;

  const prisma = getPrisma();
  const antes = await prisma.portalUserCompany.findUnique({
    where: { portalUserId_companyId: { portalUserId: conta.id, companyId: empresa.id } },
    select: { incluiFiliais: true },
  });
  if (antes && antes.incluiFiliais === incluiFiliais) return { ok: true, mensagem: "Nada mudou: o acesso já estava assim." };

  await prisma.$transaction(async (tx) => {
    await tx.portalUserCompany.upsert({
      where: { portalUserId_companyId: { portalUserId: conta.id, companyId: empresa.id } },
      create: { tenantId: ctx.tenantId, portalUserId: conta.id, companyId: empresa.id, incluiFiliais },
      update: { incluiFiliais },
    });
    // Tirar as filiais pode tirar empresa do alcance.
    if (antes) await desligarAlcadasForaDoAlcance(tx, ctx.tenantId, conta.id);
  });

  const escolha: EmpresaEscolhida = { companyId: empresa.id, nome: empresa.nome, incluiFiliais };
  await auditarEmpresas(ctx, { id: conta.id, nome: conta.name }, antes ? { filiais: [escolha] } : { ligadas: [escolha] });
  revalidar();

  if (antes) {
    return { ok: true, mensagem: incluiFiliais ? `${conta.name} passa a ver também as filiais.` : `${conta.name} deixa de ver as filiais pela matriz.` };
  }
  return { ok: true, mensagem: `${conta.name} passa a ver ${empresa.nome} no portal.` };
}

/**
 * Desliga uma empresa de um acesso, sem apagar a conta. Só a ligação direta: a
 * empresa que vem pela matriz sai desligando a matriz (ou tirando as filiais
 * dela). O limite de aprovação que a pessoa tinha na empresa é desligado.
 */
export async function desligarEmpresaDoAcesso(portalUserId: string, companyId: string): Promise<ResultadoDoAcesso> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { erro: "Sem permissão." };
  if (!(await portalPorEmpresaPronto())) return { erro: FALTA_ATUALIZAR_O_BANCO_DO_PORTAL };

  const achados = await contaEEmpresa(ctx.tenantId, portalUserId, companyId);
  if (!achados) return { erro: "Acesso ou empresa não encontrado." };
  const { conta, empresa } = achados;

  const resultado = await getPrisma().$transaction(async (tx) => {
    const r = await tx.portalUserCompany.deleteMany({ where: { tenantId: ctx.tenantId, portalUserId: conta.id, companyId: empresa.id } });
    if (r.count === 0) return null;
    return desligarAlcadasForaDoAlcance(tx, ctx.tenantId, conta.id);
  });
  if (resultado === null) return { erro: "Esta empresa não está ligada direto a este acesso." };

  await auditarEmpresas(ctx, { id: conta.id, nome: conta.name }, { desligadas: [empresa] });
  revalidar();
  return { ok: true, mensagem: `${conta.name} deixa de ver ${empresa.nome} no portal. O acesso continua.` };
}

/** O que a janela de exclusão mostra antes de a pessoa confirmar. */
export type ResumoDoAcessoParaExcluir = {
  nome: string;
  email: string;
  /** "vê BLD MATRIZ e IRRIGA", ou "sem empresa ligada". */
  empresas: string;
  historico: HistoricoDoAcesso;
};

/** Conta o que está ligado ao acesso, para a janela de exclusão. Só leitura. */
export async function resumoDoAcessoParaExcluir(id: string): Promise<{ erro: string } | ResumoDoAcessoParaExcluir> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !podeExcluir(ctx)) return { erro: "Só administradores excluem acessos do portal." };

  const conta = await getPrisma().portalUser.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: { id: true, name: true, email: true, clientGroupId: true, _count: { select: CONTAGEM_DO_ACESSO } },
  });
  if (!conta) return { erro: "Acesso não encontrado." };
  const ligadas = (await empresasLigadasDasContas(ctx.tenantId, [conta])).get(conta.id) ?? [];

  return {
    nome: conta.name,
    email: conta.email,
    empresas: ligadas.length > 0 ? `vê ${listaDeNomes(ligadas.map((e) => e.nome))}` : "sem empresa ligada",
    historico: resumirHistoricoDoAcesso(conta._count),
  };
}

/**
 * Exclui o acesso de verdade (regras de 13/10/2026, ver lib/exclusaoConfirmada).
 *
 * O que o banco faz sozinho, e por isso não há `deleteMany` de cada tabela
 * aqui: mensagens, solicitações, arquivos, aprovações e registros de download
 * ficam, com o autor em branco (`SET NULL`); limite de aprovação, "comunicado
 * lido", aparelho de notificação e as ligações com as empresas vão junto
 * (`CASCADE`). O token de redefinição de senha não tem FK — é apagado à mão,
 * na mesma transação.
 *
 * A sessão aberta morre na próxima tela: toda leitura do portal confere no
 * banco que a conta existe (`sessaoAtivaDoPortal`).
 *
 * A auditoria leva o retrato do que existia — nome, e-mail, empresas e a
 * contagem — porque depois da exclusão o id não aponta para mais nada.
 */
export async function excluirAcessoDoPortal(id: string, confirmacao: string): Promise<{ erro: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !podeExcluir(ctx)) return { erro: "Só administradores excluem acessos do portal." };

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      clientGroupId: true,
      _count: { select: CONTAGEM_DO_ACESSO },
    },
  });
  if (!conta) return { erro: "Acesso não encontrado." };
  if (!confirmacaoConfere(confirmacao, [conta.name, conta.email])) {
    return { erro: `O nome digitado não confere. Digite ${conta.name} para confirmar.` };
  }
  const ligadas = (await empresasLigadasDasContas(ctx.tenantId, [conta])).get(conta.id) ?? [];

  const excluidos = await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: conta.id, subject: "PORTAL_USER" } });
    const r = await tx.portalUser.deleteMany({ where: { id: conta.id, tenantId: ctx.tenantId } });
    return r.count;
  });
  if (excluidos !== 1) return { erro: "Acesso não encontrado." };
  // A marca do tutorial do primeiro acesso (sem chave estrangeira): fora da
  // transação e sem lançar — uma linha órfã não vale desfazer a exclusão.
  await apagarTutoriaisDoPortal(ctx.tenantId, [conta.id]);

  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: "portal.user.deleted",
    entityType: "PortalUser",
    entityId: conta.id,
    metadata: {
      nome: conta.name,
      email: conta.email,
      ativo: conta.active,
      empresas: ligadas.map((e) => ({ id: e.id, nome: e.nome, incluiFiliais: e.incluiFiliais })),
      historico: conta._count,
    },
  });
  revalidar();
  return { ok: true };
}

async function enviarLinkDeSenhaInterno(tenantId: string, portalUserId: string, email: string): Promise<boolean> {
  const prisma = getPrisma();
  const smtp = await prisma.tenantSmtpConfig.findUnique({ where: { tenantId } });
  if (!smtp) return false;
  const token = await createPasswordResetToken(portalUserId, "PORTAL_USER");
  const r = await sendPasswordResetEmail({ tenantId, to: email, resetToken: token, destino: "portal" });
  return r.ok;
}

/** Reenvia o link de definição de senha — para quando o primeiro e-mail não chegou. */
export async function enviarLinkDeSenha(portalUserId: string): Promise<{ error: string } | { ok: true }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return { error: "Sem permissão." };

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id: portalUserId, tenantId: ctx.tenantId },
    select: { id: true, email: true, active: true },
  });
  if (!conta) return { error: "Acesso não encontrado." };
  if (!conta.active) return { error: "Acesso desativado — reative antes de mandar o link." };

  const ok = await enviarLinkDeSenhaInterno(ctx.tenantId, conta.id, conta.email);
  return ok ? { ok: true } : { error: "Não foi possível enviar. Confira o SMTP do workspace." };
}

/** Liga/desliga o acesso. Desativado não entra e não recebe link. */
export async function alternarAcessoDoPortal(portalUserId: string, ativo: boolean): Promise<void> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) return;

  const prisma = getPrisma();
  const conta = await prisma.portalUser.findFirst({
    where: { id: portalUserId, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (!conta) return;

  await prisma.portalUser.update({ where: { id: conta.id }, data: { active: ativo } });
  await logAudit({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    action: ativo ? "portal.user.enabled" : "portal.user.disabled",
    entityType: "PortalUser",
    entityId: conta.id,
  });
  revalidar();
}
