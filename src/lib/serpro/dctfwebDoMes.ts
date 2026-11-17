// A DCTFWeb do mês pelo Serpro (17/11/2026, funcionalidade-734): a rotina que
// baixa sozinha o recibo e o DARF da DCTFWeb das empresas marcadas, a fila do
// "Rodar agora" e o que a tela mostra. As regras estão em ./dctfweb.ts.
//
// Toda chamada passa pelo `chamarSerpro` (portão da procuração, teto da
// conexão, registro em `serpro_calls`, termo do procurador). Além do teto da
// conexão, a rotina tem o teto dela no mês (opcional), contado pelas chamadas
// cobradas com origem "dctfweb". Os PDFs vão para a pasta Guias da empresa,
// como as guias emitidas pela ficha, e o DARF entra nas Guias do mês.
//
// Uma empresa que dá erro não para as outras; o lote só para no que vale para
// todas: teto, conexão que deixou de estar pronta, autenticação ou termo recusados.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { isModuleEnabled } from "@/lib/modules";
import { hojeIso } from "@/lib/datas/calendario";
import { documentoDaEmpresa } from "@/lib/companyTaxId";
import { nomeExibicao } from "@/lib/companyName";
import { guardarArquivo } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { registroDaGuia } from "@/lib/guias/registro";
import { registrarGuiaEmitida } from "@/lib/guias/servidor";
import { chamarSerpro, configuracaoDoSerpro, contagemDoMes, inicioDoMes, prontidaoDoSerpro, type ResultadoDaChamada } from "./cliente";
import { podeChamar } from "./portao";
import { pastaDoModeloDaEmpresa } from "./situacaoFiscal";
import { chaveDoContribuinte } from "./servicos";
import { custoDoMes, foiCobrada, reais, type TipoDeCobranca } from "./regras";
import { lerGuiaEmitida, nomeDaGuia, pedidoDaGuia } from "./guias";
import type { Transporte } from "./transporte";
import {
  competenciaDaRotina,
  custoDaLinha,
  deveTentar,
  DIA_SEM_EVENTO_PADRAO,
  guiaDaCompetencia,
  lerReciboDaDctfweb,
  mesSeguinte,
  nomeDoRecibo,
  pedidoDoRecibo,
  recusaDaDctfweb,
  RECIBO_DA_DCTFWEB,
  SITUACOES_RESOLVIDAS,
  type SituacaoDaDctfweb,
} from "./dctfweb";

export const ORIGEM_DA_DCTFWEB = "dctfweb";
/** A rotina sai a partir desta hora (São Paulo): os eventos do dia são pedidos às 7h. */
export const HORA_DA_ROTINA = 8;
/** Empresas por ciclo do agendador (cada uma, até duas chamadas de até 35 s). */
const POR_CICLO = 25;
/** Empresas tratadas na hora do clique; o resto fica na fila do agendador. */
const POR_CLIQUE = 10;
const TRAVA_MS = 5 * 60_000;
const UMA_HORA_MS = 60 * 60_000;

export type OpcoesDaDctfweb = { transporte?: Transporte; agora?: () => Date };

const amanha = (agora: Date) => new Date(agora.getTime() + 24 * UMA_HORA_MS);
const iso = (d: Date | null) => (d ? hojeIso(d) : null);

function horaEmSaoPaulo(agora: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(agora));
}

// ─── Ajuste e empresas ───────────────────────────────────────────────────────

export type AjusteDaRotina = { ligada: boolean; diaSemEvento: number; tetoCentavos: number | null };

export async function ajusteDaRotina(tenantId: string): Promise<AjusteDaRotina> {
  const r = await getPrisma().serproDctfwebRotina.findUnique({ where: { tenantId }, select: { ligada: true, diaSemEvento: true, tetoCentavos: true } });
  return r ?? { ligada: false, diaSemEvento: DIA_SEM_EVENTO_PADRAO, tetoCentavos: null };
}

export async function salvarAjusteDaRotina(tenantId: string, a: AjusteDaRotina): Promise<void> {
  await getPrisma().serproDctfwebRotina.upsert({ where: { tenantId }, create: { tenantId, ...a }, update: a });
}

/** Marca ou desmarca as empresas; só as do escritório e com CNPJ. Devolve quantas entraram. */
export async function marcarEmpresas(tenantId: string, companyIds: string[], entra: boolean): Promise<number> {
  const prisma = getPrisma();
  if (!entra) {
    const r = await prisma.serproDctfwebEmpresa.deleteMany({ where: { tenantId, companyId: { in: companyIds } } });
    return r.count;
  }
  const empresas = await prisma.company.findMany({ where: { tenantId, id: { in: companyIds } }, select: { id: true, kind: true, cnpj: true, cpf: true } });
  const comCnpj = empresas.filter((e) => documentoDaEmpresa(e)?.digitos.length === 14).map((e) => e.id);
  const ja = new Set((await prisma.serproDctfwebEmpresa.findMany({ where: { tenantId, companyId: { in: comCnpj } }, select: { companyId: true } })).map((e) => e.companyId));
  const novas = comCnpj.filter((id) => !ja.has(id));
  if (novas.length) await prisma.serproDctfwebEmpresa.createMany({ data: novas.map((companyId) => ({ tenantId, companyId })) });
  return novas.length;
}

// ─── Custo ───────────────────────────────────────────────────────────────────

/** O preço da próxima chamada de cada tipo, pela faixa que o mês já atingiu. */
async function precoDoMes(tenantId: string, mes: string): Promise<{ consulta: number; emissao: number }> {
  const c = custoDoMes(await contagemDoMes(tenantId, mes));
  return { consulta: c.porTipo.CONSULTA.centavos, emissao: c.porTipo.EMISSAO.centavos };
}

/** O que a rotina já gastou no mês de cobrança, em centavos, pelas chamadas cobradas com a origem dela. */
export async function gastoDaRotinaNoMes(tenantId: string, mes = hojeIso().slice(0, 7)): Promise<{ consultas: number; emissoes: number; centavos: number }> {
  const grupos = await getPrisma().serproCall.groupBy({
    by: ["tipoDeCobranca"],
    where: { tenantId, cobrada: true, ambiente: "PRODUCAO", origem: ORIGEM_DA_DCTFWEB, createdAt: { gte: inicioDoMes(mes), lt: inicioDoMes(mesSeguinte(mes)) } },
    _count: { _all: true },
  });
  const n = (t: TipoDeCobranca) => grupos.find((g) => g.tipoDeCobranca === t)?._count._all ?? 0;
  const preco = await precoDoMes(tenantId, mes);
  const consultas = n("CONSULTA");
  const emissoes = n("EMISSAO");
  return { consultas, emissoes, centavos: custoDaLinha({ consultasCobradas: consultas, emissoesCobradas: emissoes }, preco) };
}

// ─── Uma empresa ─────────────────────────────────────────────────────────────

type Empresa = { id: string; nome: string; cnpj: string | null };

/** Para o lote inteiro: o que deu errado vale para todas as empresas. */
type Parada = { parar: string };
type Feito = { situacao: SituacaoDaDctfweb };

const PARA_O_LOTE = new Set<string>(["nao_pronta", "teto", "autenticacao", "termo"]);
const tipoDe = (r: ResultadoDaChamada) => (r.ok ? 200 : r.status);

type Contexto = {
  tenantId: string;
  competencia: string;
  agora: Date;
  /** AAAA-MM-DD de São Paulo. */
  hoje: string;
  userId: string | null;
  transporte?: Transporte;
  /** O que a rotina ainda pode gastar no mês, em centavos; nulo = sem teto próprio. */
  folga: { centavos: number | null; preco: { consulta: number; emissao: number } };
};

async function guardarPdf(c: Contexto, pasta: string, nome: string, pdf: string): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const g = await guardarArquivo({
    tenantId: c.tenantId,
    folderId: pasta,
    arquivo: new File([Buffer.from(pdf, "base64")], nome, { type: "application/pdf" }),
    uploadedByUserId: c.userId,
  });
  return g.ok ? { ok: true, id: g.arquivoId } : { ok: false, erro: g.erro };
}

/** Cabe mais esta chamada no teto da rotina? Desconta da folga quando cabe. */
function gastar(c: Contexto, tipo: "consulta" | "emissao"): boolean {
  if (c.folga.centavos === null) return true;
  const preco = c.folga.preco[tipo];
  if (preco > c.folga.centavos) return false;
  c.folga.centavos -= preco;
  return true;
}

async function processarEmpresa(c: Contexto, e: Empresa, linhaId: string): Promise<Feito | Parada> {
  const prisma = getPrisma();
  const linha = (await prisma.serproDctfweb.findUnique({ where: { id: linhaId } }))!;
  const fim = async (situacao: SituacaoDaDctfweb, extra: Record<string, unknown> = {}): Promise<Feito> => {
    await prisma.serproDctfweb.update({
      where: { id: linhaId },
      data: { situacao, travadaAte: null, ultimaTentativa: c.agora, ...extra },
    });
    return { situacao };
  };
  const erro = (texto: string, proxima: Date | null = amanha(c.agora)) =>
    fim("ERRO", { erro: texto.slice(0, 500), tentativas: linha.tentativas + 1, proximaTentativa: proxima });

  if (!e.cnpj) return erro("A empresa não tem CNPJ válido no cadastro: a DCTFWeb do mês é só de CNPJ.", null);
  if (!(await isModuleEnabled(c.tenantId, MODULO_ARQUIVOS))) return { parar: "Os PDFs vão para a pasta Guias da empresa, e os Arquivos estão desligados." };
  const pasta = await pastaDoModeloDaEmpresa(c.tenantId, e.id, "guias");
  if (!pasta) return erro("A empresa não tem a pasta Guias nos Arquivos (ela vem do modelo de pastas do escritório).");

  // A procuração, de graça, antes de qualquer chamada: o 403 seria cobrado.
  const portao = await podeChamar(c.tenantId, e.cnpj, RECIBO_DA_DCTFWEB, c.hoje);
  if (!portao.pode) return fim("SEM_PROCURACAO", { erro: portao.motivo.slice(0, 500), proximaTentativa: amanha(c.agora) });

  let consultas = linha.consultasCobradas;
  let emissoes = linha.emissoesCobradas;
  let reciboId = linha.reciboArquivoId;

  // 1. O recibo: diz se há declaração transmitida (o 404 não é cobrado).
  if (!reciboId) {
    if (!gastar(c, "consulta")) return { parar: "teto_da_rotina" };
    const r = await chamarSerpro(c.tenantId, pedidoDoRecibo(c.competencia, e.cnpj), { userId: c.userId, origem: ORIGEM_DA_DCTFWEB, transporte: c.transporte });
    if (foiCobrada("Consultar", tipoDe(r))) consultas++;
    // Logo depois da chamada: o que foi cobrado fica na linha, aconteça o que acontecer depois.
    await prisma.serproDctfweb.update({ where: { id: linhaId }, data: { consultasCobradas: consultas } });
    if (!r.ok) {
      if (PARA_O_LOTE.has(r.motivo)) {
        await prisma.serproDctfweb.update({ where: { id: linhaId }, data: { travadaAte: null, erro: r.erro.slice(0, 500) } });
        return { parar: r.erro };
      }
      if (r.motivo === "sem_autorizacao") return fim("SEM_PROCURACAO", { erro: r.erro.slice(0, 500), proximaTentativa: amanha(c.agora) });
      if (r.motivo === "rede") return erro(r.erro, new Date(c.agora.getTime() + UMA_HORA_MS));
      if (r.resposta && recusaDaDctfweb(r.resposta.mensagens) === "sem_declaracao") {
        return fim("SEM_DECLARACAO", { erro: r.erro.slice(0, 500), proximaTentativa: null, tentativas: 0 });
      }
      return erro(r.erro);
    }
    const lido = lerReciboDaDctfweb(r.resposta);
    if (!lido.ok) return erro(lido.erro);
    const g = await guardarPdf(c, pasta, nomeDoRecibo(e.nome, c.competencia), lido.dados.pdf);
    if (!g.ok) return erro(`O recibo veio do Serpro, mas não foi guardado nos Arquivos: ${g.erro}`);
    reciboId = g.id;
    await prisma.serproDctfweb.update({ where: { id: linhaId }, data: { reciboArquivoId: reciboId } });
  }

  // 2. O DARF, com todos os débitos da declaração, para pagar hoje.
  if (!gastar(c, "emissao")) {
    await prisma.serproDctfweb.update({ where: { id: linhaId }, data: { travadaAte: null } });
    return { parar: "teto_da_rotina" };
  }
  const guia = guiaDaCompetencia(c.competencia);
  const r = await chamarSerpro(c.tenantId, pedidoDaGuia(guia, e.cnpj), { userId: c.userId, origem: ORIGEM_DA_DCTFWEB, transporte: c.transporte });
  if (foiCobrada("Emitir", tipoDe(r))) emissoes++;
  await prisma.serproDctfweb.update({ where: { id: linhaId }, data: { emissoesCobradas: emissoes } });
  if (!r.ok) {
    if (PARA_O_LOTE.has(r.motivo)) {
      await prisma.serproDctfweb.update({ where: { id: linhaId }, data: { situacao: "PENDENTE", travadaAte: null, erro: r.erro.slice(0, 500), proximaTentativa: c.agora } });
      return { parar: r.erro };
    }
    if (r.motivo === "sem_autorizacao") return fim("SEM_PROCURACAO", { erro: r.erro.slice(0, 500), proximaTentativa: amanha(c.agora) });
    if (r.motivo === "rede") return erro(r.erro, new Date(c.agora.getTime() + UMA_HORA_MS));
    const recusa = r.resposta ? recusaDaDctfweb(r.resposta.mensagens) : "erro";
    if (recusa === "sem_debito") return fim("SEM_DEBITO", { erro: null, proximaTentativa: null });
    if (recusa === "sem_declaracao") return fim("SEM_DECLARACAO", { erro: r.erro.slice(0, 500), proximaTentativa: null, tentativas: 0 });
    if (recusa === "esperar") return fim("PENDENTE", { erro: r.erro.slice(0, 500), tentativas: linha.tentativas + 1, proximaTentativa: amanha(c.agora) });
    return erro(r.erro);
  }
  const lida = lerGuiaEmitida(guia, r.resposta);
  if (!lida.ok) return erro(lida.erro);
  const g = await guardarPdf(c, pasta, nomeDaGuia(guia, e.nome), lida.dados.pdf);
  if (!g.ok) return erro(`O DARF veio do Serpro, mas não foi guardado nos Arquivos: ${g.erro}`);
  // O registro não tira o DARF de quem pediu: o PDF já está nos Arquivos.
  try {
    await registrarGuiaEmitida({ tenantId: c.tenantId, companyId: e.id, userId: c.userId, registro: registroDaGuia(guia, lida.dados), driveFileId: g.id });
  } catch (err) {
    console.error("[dctfweb] o DARF foi guardado, mas não entrou nas Guias do mês", err);
  }
  return fim("BAIXADO", { darfArquivoId: g.id, erro: null, proximaTentativa: null });
}

// ─── O lote ──────────────────────────────────────────────────────────────────

export type ResumoDoLote = {
  competencia: string;
  tratadas: number;
  porSituacao: Partial<Record<SituacaoDaDctfweb, number>>;
  /** Por que o lote parou antes do fim (teto, conexão…); nulo = foi até onde devia. */
  parou: string | null;
};

type Rodada = {
  competencia: string;
  agora: Date;
  userId: string | null;
  limite: number;
  /** Só estas empresas (o clique); sem isso, todas as marcadas. */
  companyIds?: string[];
  transporte?: Transporte;
};

/** Trata as empresas que a regra manda, uma de cada vez, travando a linha enquanto trabalha. */
async function rodarLote(tenantId: string, ajuste: AjusteDaRotina, x: Rodada): Promise<ResumoDoLote> {
  const prisma = getPrisma();
  const resumo: ResumoDoLote = { competencia: x.competencia, tratadas: 0, porSituacao: {}, parou: null };
  const hoje = hojeIso(x.agora);

  const marcadas = await prisma.serproDctfwebEmpresa.findMany({
    where: { tenantId, ...(x.companyIds ? { companyId: { in: x.companyIds } } : {}) },
    select: { companyId: true },
  });
  if (!marcadas.length) return resumo;
  const ids = marcadas.map((m) => m.companyId);
  const [empresas, linhas, eventos] = await Promise.all([
    prisma.company.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, kind: true, cnpj: true, cpf: true, name: true, displayName: true } }),
    prisma.serproDctfweb.findMany({ where: { tenantId, competencia: x.competencia, companyId: { in: ids } } }),
    prisma.serproEvento.findMany({ where: { tenantId, evento: "E0301" }, select: { chave: true, ultimoEm: true } }),
  ]);
  const linhaDe = new Map(linhas.map((l) => [l.companyId, l]));
  const eventoDe = new Map(eventos.map((ev) => [ev.chave, iso(ev.ultimoEm)]));

  const mes = hoje.slice(0, 7);
  const preco = await precoDoMes(tenantId, mes);
  const gasto = ajuste.tetoCentavos === null ? null : (await gastoDaRotinaNoMes(tenantId, mes)).centavos;

  const c: Contexto = {
    tenantId,
    competencia: x.competencia,
    agora: x.agora,
    hoje,
    userId: x.userId,
    transporte: x.transporte,
    folga: { centavos: ajuste.tetoCentavos === null ? null : Math.max(0, ajuste.tetoCentavos - gasto!), preco },
  };

  for (const e of empresas) {
    if (resumo.tratadas >= x.limite) break;
    const doc = documentoDaEmpresa(e);
    const cnpj = doc?.digitos.length === 14 ? doc.digitos : null;
    const l = linhaDe.get(e.id) ?? null;
    const quer = deveTentar(
      l ? { situacao: l.situacao as SituacaoDaDctfweb, tentativas: l.tentativas, ultimaTentativa: iso(l.ultimaTentativa), proximaTentativa: l.proximaTentativa } : null,
      { agora: x.agora, hoje, competencia: x.competencia, ligada: ajuste.ligada, diaSemEvento: ajuste.diaSemEvento, ultimoEvento: cnpj ? (eventoDe.get(chaveDoContribuinte(cnpj)) ?? null) : null }
    );
    if (!quer) continue;

    // A trava: outro ciclo (ou outro clique) pode estar na mesma linha.
    const linha =
      l ??
      (await prisma.serproDctfweb.upsert({
        where: { tenantId_companyId_competencia: { tenantId, companyId: e.id, competencia: x.competencia } },
        create: { tenantId, companyId: e.id, competencia: x.competencia, situacao: "PENDENTE", proximaTentativa: x.agora },
        update: {},
      }));
    const travou = await prisma.serproDctfweb.updateMany({
      where: { id: linha.id, OR: [{ travadaAte: null }, { travadaAte: { lt: x.agora } }] },
      data: { travadaAte: new Date(x.agora.getTime() + TRAVA_MS) },
    });
    if (!travou.count) continue;

    resumo.tratadas++;
    let r: Feito | Parada;
    try {
      r = await processarEmpresa(c, { id: e.id, nome: nomeExibicao(e), cnpj }, linha.id);
    } catch (err) {
      // Uma empresa que quebra não para as outras.
      console.error("[dctfweb] falha numa empresa", e.id, err);
      await prisma.serproDctfweb.update({
        where: { id: linha.id },
        data: { situacao: "ERRO", travadaAte: null, ultimaTentativa: x.agora, tentativas: linha.tentativas + 1, proximaTentativa: amanha(x.agora), erro: "Falha inesperada do Connect ao tratar esta empresa." },
      });
      r = { situacao: "ERRO" };
    }
    if ("parar" in r) {
      resumo.tratadas--;
      await prisma.serproDctfweb.updateMany({ where: { id: linha.id }, data: { travadaAte: null } });
      resumo.parou =
        r.parar === "teto_da_rotina" ? `Teto da rotina da DCTFWeb atingido (${reais(ajuste.tetoCentavos ?? 0)} no mês). As demais ficam para o mês que vem, ou com um teto maior.` : r.parar;
      break;
    }
    resumo.porSituacao[r.situacao] = (resumo.porSituacao[r.situacao] ?? 0) + 1;
  }
  return resumo;
}

/**
 * O ciclo do agendador (a cada 10 minutos). Só na produção, com a conexão
 * pronta e a partir das 8h. Trata a competência do mês passado: as empresas
 * novas (com a rotina ligada) e a fila de quem clicou.
 */
export async function rotinaDaDctfweb(tenantId: string, opcoes: OpcoesDaDctfweb = {}): Promise<number> {
  const agora = (opcoes.agora ?? (() => new Date()))();
  const cfg = await configuracaoDoSerpro(tenantId);
  if (!cfg || cfg.ambiente !== "producao" || !prontidaoDoSerpro(cfg).pronta) return 0;
  if (horaEmSaoPaulo(agora) < HORA_DA_ROTINA) return 0;
  const ajuste = await ajusteDaRotina(tenantId);
  const competencia = competenciaDaRotina(hojeIso(agora));
  const r = await rodarLote(tenantId, ajuste, { competencia, agora, userId: null, limite: POR_CICLO, transporte: opcoes.transporte });
  // A fila de clique de competências anteriores (tentar de novo um mês antigo).
  const antigas = await getPrisma().serproDctfweb.findMany({
    where: { tenantId, competencia: { not: competencia }, situacao: { in: ["PENDENTE", "ERRO", "SEM_PROCURACAO", "SEM_DECLARACAO"] }, proximaTentativa: { lte: agora } },
    select: { competencia: true },
    distinct: ["competencia"],
  });
  let tratadas = r.tratadas;
  for (const a of antigas) {
    if (r.parou || tratadas >= POR_CICLO) break;
    const outra = await rodarLote(tenantId, { ...ajuste, ligada: false }, { competencia: a.competencia, agora, userId: null, limite: POR_CICLO - tratadas, transporte: opcoes.transporte });
    tratadas += outra.tratadas;
    if (outra.parou) break;
  }
  return tratadas;
}

/**
 * O "Rodar agora" e o "Tentar de novo" da tela: põe as empresas na fila da
 * competência (o que está resolvido fica de fora, e o já baixado não é pedido
 * de novo) e trata as primeiras na hora. O resto o agendador continua.
 */
export async function rodarAgora(
  tenantId: string,
  userId: string,
  competencia: string,
  companyIds: string[] | null,
  opcoes: OpcoesDaDctfweb = {}
): Promise<{ ok: true; resumo: ResumoDoLote; naFila: number } | { ok: false; erro: string }> {
  const agora = (opcoes.agora ?? (() => new Date()))();
  const cfg = await configuracaoDoSerpro(tenantId);
  const pronta = prontidaoDoSerpro(cfg);
  if (!pronta.pronta) return { ok: false, erro: pronta.motivo };
  if (cfg!.ambiente !== "producao") return { ok: false, erro: "A conexão do Serpro está em demonstração, que não responde com dados de clientes: a DCTFWeb só roda na produção." };

  const prisma = getPrisma();
  const marcadas = await prisma.serproDctfwebEmpresa.findMany({
    where: { tenantId, ...(companyIds ? { companyId: { in: companyIds } } : {}) },
    select: { companyId: true },
  });
  if (!marcadas.length) return { ok: false, erro: "Nenhuma empresa marcada para a DCTFWeb do mês." };
  const ids = marcadas.map((m) => m.companyId);
  const existentes = await prisma.serproDctfweb.findMany({ where: { tenantId, competencia, companyId: { in: ids } }, select: { companyId: true, situacao: true } });
  const resolvidas = new Set(existentes.filter((l) => SITUACOES_RESOLVIDAS.includes(l.situacao as SituacaoDaDctfweb)).map((l) => l.companyId));
  const naFila = ids.filter((id) => !resolvidas.has(id));
  for (const companyId of naFila) {
    // Quem clicou zera as tentativas: o erro de antes pode ter sido resolvido.
    await prisma.serproDctfweb.upsert({
      where: { tenantId_companyId_competencia: { tenantId, companyId, competencia } },
      create: { tenantId, companyId, competencia, situacao: "PENDENTE", proximaTentativa: agora },
      update: { proximaTentativa: agora, tentativas: 0 },
    });
  }
  await logAudit({ tenantId, userId, action: "autorizacoes.serpro_dctfweb", entityType: "Tenant", entityId: tenantId, metadata: { competencia, empresas: naFila.length } });
  const resumo = await rodarLote(tenantId, await ajusteDaRotina(tenantId), {
    competencia,
    agora,
    userId,
    limite: POR_CLIQUE,
    companyIds: naFila,
    transporte: opcoes.transporte,
  });
  return { ok: true, resumo, naFila: naFila.length };
}

// ─── A tela ──────────────────────────────────────────────────────────────────

export type LinhaNaTela = {
  companyId: string;
  empresa: string;
  cnpj: string;
  situacao: SituacaoDaDctfweb | null;
  reciboArquivoId: string | null;
  darfArquivoId: string | null;
  erro: string | null;
  ultimaTentativa: Date | null;
  naFila: boolean;
  custoCentavos: number;
};

export type DctfwebNaTela = {
  ajuste: AjusteDaRotina;
  linhas: LinhaNaTela[];
  gastoNoMes: { consultas: number; emissoes: number; centavos: number };
  custoDaCompetencia: number;
};

export async function dctfwebDoMes(tenantId: string, competencia: string, agora = new Date()): Promise<DctfwebNaTela> {
  const prisma = getPrisma();
  const [ajuste, marcadas, linhas, gastoNoMes, preco] = await Promise.all([
    ajusteDaRotina(tenantId),
    prisma.serproDctfwebEmpresa.findMany({ where: { tenantId }, select: { companyId: true } }),
    prisma.serproDctfweb.findMany({ where: { tenantId, competencia } }),
    gastoDaRotinaNoMes(tenantId, hojeIso(agora).slice(0, 7)),
    precoDoMes(tenantId, hojeIso(agora).slice(0, 7)),
  ]);
  const linhaDe = new Map(linhas.map((l) => [l.companyId, l]));
  const empresas = await prisma.company.findMany({
    where: { tenantId, id: { in: marcadas.map((x) => x.companyId) } },
    select: { id: true, kind: true, cnpj: true, cpf: true, name: true, displayName: true },
  });
  const resultado = empresas
    .map((e): LinhaNaTela => {
      const l = linhaDe.get(e.id);
      return {
        companyId: e.id,
        empresa: nomeExibicao(e),
        cnpj: documentoDaEmpresa(e)?.digitos ?? "",
        situacao: (l?.situacao as SituacaoDaDctfweb | undefined) ?? null,
        reciboArquivoId: l?.reciboArquivoId ?? null,
        darfArquivoId: l?.darfArquivoId ?? null,
        erro: l?.erro ?? null,
        ultimaTentativa: l?.ultimaTentativa ?? null,
        naFila: !!l?.proximaTentativa && !SITUACOES_RESOLVIDAS.includes(l.situacao as SituacaoDaDctfweb),
        custoCentavos: l ? custoDaLinha(l, preco) : 0,
      };
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
  return { ajuste, linhas: resultado, gastoNoMes, custoDaCompetencia: resultado.reduce((s, l) => s + l.custoCentavos, 0) };
}

/** As empresas com CNPJ que ainda não entraram, para a lista de marcar. */
export async function empresasParaMarcar(tenantId: string): Promise<{ id: string; nome: string; cnpj: string }[]> {
  const prisma = getPrisma();
  const [todas, marcadas] = await Promise.all([
    prisma.company.findMany({ where: { tenantId, cnpj: { not: null } }, select: { id: true, kind: true, cnpj: true, cpf: true, name: true, displayName: true } }),
    prisma.serproDctfwebEmpresa.findMany({ where: { tenantId }, select: { companyId: true } }),
  ]);
  const ja = new Set(marcadas.map((m) => m.companyId));
  return todas
    .filter((e) => !ja.has(e.id))
    .map((e) => ({ id: e.id, nome: nomeExibicao(e), cnpj: documentoDaEmpresa(e)?.digitos ?? "" }))
    .filter((e) => e.cnpj.length === 14)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
