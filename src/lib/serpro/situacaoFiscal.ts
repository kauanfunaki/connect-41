// O relatório de situação fiscal (Sitfis) de uma empresa, do clique ao PDF
// nos Arquivos (Fase 1 do Integra Contador, 20/10/2026).
//
// O pedido vive em `serpro_pedidos`: PROTOCOLO (falta pedir o protocolo),
// RESULTADO (falta buscar o relatório), PRONTO, FALHOU ou EXPIRADO. Cada passo
// marca a próxima tentativa, que nunca vem antes do tempo de espera do Serpro
// (emitir cedo devolve 202, e o 202 é cobrado). O clique já pede o protocolo e,
// se a espera é curta, espera e emite ali mesmo; o resto fica com o agendador,
// a cada 10 minutos. Regras do Sitfis em ./sitfis.ts.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { isModuleEnabled } from "@/lib/modules";
import { hojeIso } from "@/lib/datas/calendario";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { garantirPastasDaEmpresa, guardarArquivo } from "@/lib/drive/servidor";
import { chaveDoModelo, MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { chamarSerpro, configuracaoDoSerpro, prontidaoDoSerpro, SO_EXEMPLOS_NA_DEMONSTRACAO } from "./cliente";
import { podeChamar } from "./portao";
import type { Transporte } from "./transporte";
import { ESPERA_DE_FALHA_MS, nomeDoRelatorio, passoDoProtocolo, passoDoRelatorio, pedidoDoProtocolo, pedidoDoRelatorio, RELATORIO, type Passo } from "./sitfis";

export const TIPO_SITFIS = "SITFIS";
/** Espera que o clique aguenta antes de deixar o resto com o agendador. */
const ESPERA_NA_TELA_MS = 15_000;
/** O agendador segura o pedido por este tempo enquanto trabalha nele (a trava). */
const TRAVA_MS = 5 * 60_000;
/** Tentativas até desistir (o 204 pode se repetir algumas vezes). */
const TENTATIVAS_MAXIMAS = 30;
const EM_ANDAMENTO = ["PROTOCOLO", "RESULTADO"];

export type OpcoesDoSerpro = {
  transporte?: Transporte;
  esperar?: (ms: number) => Promise<void>;
  agora?: () => Date;
};

const esperarDeVerdade = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

type Pedido = {
  id: string;
  tenantId: string;
  contribuinte: string;
  companyId: string | null;
  protocolo: string | null;
  situacao: string;
  proximaTentativa: Date;
  tentativas: number;
  dia: string;
  pedidoPorId: string | null;
};

const SELECT_PEDIDO = {
  id: true,
  tenantId: true,
  contribuinte: true,
  companyId: true,
  protocolo: true,
  situacao: true,
  proximaTentativa: true,
  tentativas: true,
  dia: true,
  pedidoPorId: true,
} as const;

/**
 * A pasta Fiscal da empresa: a do modelo do escritório com esse nome, senão
 * uma pasta de primeiro nível chamada assim. Nunca uma pasta do cliente — a
 * "Fiscal" do modelo padrão não é compartilhada com o portal.
 */
export async function pastaFiscalDaEmpresa(tenantId: string, companyId: string): Promise<string | null> {
  return pastaDoModeloDaEmpresa(tenantId, companyId, "fiscal");
}

/**
 * Uma pasta de primeiro nível da empresa pelo nome do modelo ("fiscal",
 * "guias"): a criada pelo modelo do escritório, senão uma com esse nome.
 */
export async function pastaDoModeloDaEmpresa(tenantId: string, companyId: string, nome: string): Promise<string | null> {
  const alvo = normalizar(nome);
  const modelo = await garantirPastasDaEmpresa(tenantId, companyId);
  const doModelo = modelo.find((m) => m.active && normalizar(m.name) === alvo);
  const pastas = await getPrisma().driveFolder.findMany({
    where: { tenantId, companyId, parentId: null, deletedAt: null },
    select: { id: true, name: true, systemKey: true },
  });
  return (
    (doModelo && pastas.find((p) => p.systemKey === chaveDoModelo(doModelo.id))?.id) ||
    pastas.find((p) => normalizar(p.name) === alvo)?.id ||
    null
  );
}

async function nomeDaEmpresa(tenantId: string, companyId: string | null): Promise<string> {
  if (!companyId) return "a empresa";
  const e = await getPrisma().company.findFirst({ where: { id: companyId, tenantId }, select: { name: true, displayName: true } });
  return e ? nomeExibicao(e) : "a empresa";
}

async function guardarRelatorio(p: Pedido, pdf: string): Promise<{ ok: true; arquivoId: string } | { ok: false; erro: string }> {
  if (!p.companyId) return { ok: false, erro: "O pedido não tem empresa." };
  const pasta = await pastaFiscalDaEmpresa(p.tenantId, p.companyId);
  if (!pasta) return { ok: false, erro: "A pasta Fiscal da empresa não existe mais nos Arquivos." };
  const nome = nomeDoRelatorio(await nomeDaEmpresa(p.tenantId, p.companyId), p.dia);
  const r = await guardarArquivo({
    tenantId: p.tenantId,
    folderId: pasta,
    arquivo: new File([Buffer.from(pdf, "base64")], nome, { type: "application/pdf" }),
    uploadedByUserId: p.pedidoPorId,
  });
  return r.ok ? { ok: true, arquivoId: r.arquivoId } : { ok: false, erro: r.erro };
}

async function avisar(p: Pedido, texto: string) {
  if (!p.pedidoPorId) return;
  await notifyUser(p.pedidoPorId, {
    tenantId: p.tenantId,
    type: "SERPRO_SITFIS",
    message: texto.slice(0, 255),
    ...(p.companyId ? { entityType: "COMPANY" as const, entityId: p.companyId } : {}),
  });
}

/**
 * Um passo do pedido: pede o protocolo ou busca o relatório, e grava o que
 * vem depois. `avisarQuemPediu` = está no agendador, e a pessoa não está
 * olhando a tela.
 */
async function avancar(p: Pedido, o: { transporte?: Transporte; agora: () => Date; avisarQuemPediu: boolean }): Promise<Pedido> {
  const prisma = getPrisma();
  const agora = o.agora();
  const gravar = async (data: Partial<Pedido> & { erro?: string | null; driveFileId?: string | null }) => {
    await prisma.serproPedido.update({ where: { id: p.id }, data });
    return { ...p, ...data } as Pedido;
  };
  const empresa = async () => nomeDaEmpresa(p.tenantId, p.companyId);

  // O protocolo morre no fim do dia em que foi pedido.
  if (p.dia !== hojeIso(agora)) {
    const fim = await gravar({ situacao: "EXPIRADO", erro: "O protocolo do Serpro vale só no dia do pedido." });
    if (o.avisarQuemPediu) await avisar(p, `A situação fiscal de ${await empresa()} não ficou pronta no dia do pedido. Peça de novo na ficha.`);
    return fim;
  }

  const r =
    p.situacao === "PROTOCOLO" || !p.protocolo
      ? await chamarSerpro(p.tenantId, pedidoDoProtocolo(p.contribuinte), { userId: p.pedidoPorId, origem: "sitfis", transporte: o.transporte })
      : await chamarSerpro(p.tenantId, pedidoDoRelatorio(p.contribuinte, p.protocolo), { userId: p.pedidoPorId, origem: "sitfis", transporte: o.transporte });
  const passo: Passo = p.situacao === "PROTOCOLO" || !p.protocolo ? passoDoProtocolo(r) : passoDoRelatorio(r);
  const tentativas = p.tentativas + 1;
  const depois = (ms: number) => new Date(agora.getTime() + ms);

  switch (passo.tipo) {
    case "emitir":
      return gravar({ situacao: "RESULTADO", protocolo: passo.protocolo, proximaTentativa: depois(passo.esperaMs), tentativas, erro: null });
    case "pedir_de_novo":
    case "aguardar":
      if (tentativas >= TENTATIVAS_MAXIMAS) break;
      return gravar({ proximaTentativa: depois(passo.esperaMs), tentativas });
    case "pronto": {
      const guardado = await guardarRelatorio(p, passo.pdf);
      if (!guardado.ok) {
        // O relatório já foi pago: fica o motivo, para alguém resolver a pasta e pedir de novo.
        const fim = await gravar({ situacao: "FALHOU", tentativas, erro: `O relatório veio, mas não foi guardado: ${guardado.erro}`.slice(0, 500) });
        if (o.avisarQuemPediu) await avisar(p, `A situação fiscal de ${await empresa()} veio do Serpro, mas não foi guardada nos Arquivos.`);
        return fim;
      }
      const fim = await gravar({ situacao: "PRONTO", tentativas, driveFileId: guardado.arquivoId, erro: null });
      if (o.avisarQuemPediu) await avisar(p, `Situação fiscal de ${await empresa()} pronta, nos Arquivos › Fiscal.`);
      return fim;
    }
    case "erro":
      if (passo.tentarDeNovo && tentativas < TENTATIVAS_MAXIMAS) return gravar({ proximaTentativa: depois(ESPERA_DE_FALHA_MS), tentativas, erro: passo.erro.slice(0, 500) });
      break;
  }
  const erro = passo.tipo === "erro" ? passo.erro : "O Serpro não terminou o relatório depois de muitas tentativas.";
  const fim = await gravar({ situacao: "FALHOU", tentativas, erro: erro.slice(0, 500) });
  if (o.avisarQuemPediu) await avisar(p, `A situação fiscal de ${await empresa()} não saiu: ${erro}`);
  return fim;
}

export type ResultadoDoPedido = { ok: true; texto: string; pronto: boolean } | { ok: false; erro: string };

/** O clique na ficha: confere tudo antes de gastar, pede o protocolo e, se der, já emite. */
export async function pedirSituacaoFiscal(tenantId: string, userId: string, companyId: string, opcoes: OpcoesDoSerpro = {}): Promise<ResultadoDoPedido> {
  const agora = opcoes.agora ?? (() => new Date());
  const esperar = opcoes.esperar ?? esperarDeVerdade;
  const prisma = getPrisma();

  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, erro: pronta.motivo };
  if (cfg!.ambiente === "demonstracao") return { ok: false, erro: SO_EXEMPLOS_NA_DEMONSTRACAO };

  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { kind: true, cnpj: true, cpf: true } });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  const doc = documentoDaEmpresa(empresa);
  if (!doc) return { ok: false, erro: "A empresa não tem CNPJ ou CPF válido no cadastro." };

  // Sem onde guardar, não se paga o relatório.
  if (!(await isModuleEnabled(tenantId, MODULO_ARQUIVOS))) return { ok: false, erro: "O relatório vai para a pasta Fiscal da empresa, e os Arquivos estão desligados." };
  if (!(await pastaFiscalDaEmpresa(tenantId, companyId))) {
    return { ok: false, erro: "A empresa não tem a pasta Fiscal nos Arquivos (ela vem do modelo de pastas do escritório)." };
  }

  const hoje = hojeIso(agora());
  const deHoje = await prisma.serproPedido.findFirst({
    where: { tenantId, companyId, tipo: TIPO_SITFIS, dia: hoje, situacao: { in: [...EM_ANDAMENTO, "PRONTO"] } },
    orderBy: { createdAt: "desc" },
    select: { situacao: true },
  });
  if (deHoje?.situacao === "PRONTO") return { ok: true, texto: "A situação fiscal de hoje já está nos Arquivos › Fiscal.", pronto: true };
  if (deHoje) return { ok: true, texto: "A situação fiscal já foi pedida hoje: o Serpro está preparando, e o PDF chega nos Arquivos.", pronto: false };

  // O relatório exige a autorização 00002: sem ela, nem o protocolo é pedido.
  const portao = await podeChamar(tenantId, doc.digitos, RELATORIO, hoje);
  if (!portao.pode) return { ok: false, erro: portao.motivo };

  const criado = await prisma.serproPedido.create({
    data: { tenantId, tipo: TIPO_SITFIS, contribuinte: doc.digitos, companyId, situacao: "PROTOCOLO", proximaTentativa: agora(), dia: hoje, pedidoPorId: userId },
    select: SELECT_PEDIDO,
  });
  await logAudit({ tenantId, userId, action: "autorizacoes.serpro_sitfis", entityType: "Company", entityId: companyId, metadata: { pedido: criado.id } });

  let p = await avancar(criado, { transporte: opcoes.transporte, agora, avisarQuemPediu: false });
  const falta = p.proximaTentativa.getTime() - agora().getTime();
  if (p.situacao === "RESULTADO" && falta <= ESPERA_NA_TELA_MS) {
    await esperar(Math.max(falta, 0));
    p = await avancar(p, { transporte: opcoes.transporte, agora, avisarQuemPediu: false });
  }

  const linha = await prisma.serproPedido.findFirst({ where: { id: p.id }, select: { situacao: true, erro: true } });
  if (linha?.situacao === "PRONTO") return { ok: true, texto: "Situação fiscal pronta: está nos Arquivos › Fiscal.", pronto: true };
  if (linha?.situacao === "FALHOU" || linha?.situacao === "EXPIRADO") return { ok: false, erro: linha.erro ?? "O Serpro não devolveu o relatório." };
  return { ok: true, texto: "Pedido feito: o Serpro está preparando o relatório. O PDF chega nos Arquivos › Fiscal, e você recebe um aviso.", pronto: false };
}

/** O agendador (a cada 10 minutos): vence os de ontem e avança os que já podem. */
export async function processarPedidosDoSitfis(tenantId: string, opcoes: OpcoesDoSerpro & { lote?: number } = {}): Promise<number> {
  const agora = opcoes.agora ?? (() => new Date());
  const prisma = getPrisma();
  const cfg = await configuracaoDoSerpro(tenantId);
  if (!cfg || cfg.ambiente !== "producao" || !prontidaoDoSerpro(cfg).pronta) return 0;

  const devidos = await prisma.serproPedido.findMany({
    where: { tenantId, tipo: TIPO_SITFIS, situacao: { in: EM_ANDAMENTO }, proximaTentativa: { lte: agora() } },
    orderBy: { proximaTentativa: "asc" },
    take: opcoes.lote ?? 20,
    select: SELECT_PEDIDO,
  });
  let feitos = 0;
  for (const p of devidos) {
    // A trava: só avança quem conseguiu adiar a próxima tentativa — dois ciclos não emitem (e pagam) o mesmo relatório.
    const { count } = await prisma.serproPedido.updateMany({
      where: { id: p.id, situacao: p.situacao, proximaTentativa: p.proximaTentativa },
      data: { proximaTentativa: new Date(agora().getTime() + TRAVA_MS) },
    });
    if (count !== 1) continue;
    await avancar(p, { transporte: opcoes.transporte, agora, avisarQuemPediu: true });
    feitos++;
  }
  return feitos;
}

export type SitfisNaTela = {
  situacao: string;
  dia: string;
  pedidoEm: string;
  erro: string | null;
  arquivoId: string | null;
};

/** O último pedido de situação fiscal da empresa, para a ficha. */
export async function ultimoSitfisDaEmpresa(tenantId: string, companyId: string): Promise<SitfisNaTela | null> {
  const p = await getPrisma().serproPedido.findFirst({
    where: { tenantId, companyId, tipo: TIPO_SITFIS },
    orderBy: { createdAt: "desc" },
    select: { situacao: true, dia: true, createdAt: true, erro: true, driveFileId: true },
  });
  return p ? { situacao: p.situacao, dia: p.dia, pedidoEm: p.createdAt.toISOString(), erro: p.erro, arquivoId: p.driveFileId } : null;
}
