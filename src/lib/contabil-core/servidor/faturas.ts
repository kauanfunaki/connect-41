import "server-only";

// A distribuição da fatura de cartão e os documentos da fatura (Bloco C, Fase C3, 23/11/2026): porte de
// `DistribuicaoService` e de `processar_documento` (`src/domain/cartoes/distribuicao.py`) e das rotas de
// documentos (`ler_documento_fatura`, `reler_documento_fatura`, `confirmar_documento_fatura`,
// `original_documento_fatura`).
//
// - A fatura é paga por UMA transação do extrato. A distribuição diz em que contas cada gasto da fatura
//   entra; aplicar troca a classificação dessa transação pela composição (um par por componente), com a
//   composição do NEO da Fase 3 (`alterarComposicaoNaTransacao`, em `neoAvancado.ts`). Se o pagamento ainda
//   está pendente, ele é classificado antes na conta do primeiro componente, como
//   `classificar_manualmente_lote`. Desfazer devolve a composição de antes (ou cancela o lançamento, se
//   não havia), a não ser que a classificação tenha mudado no NEO depois: aí só com "preservar a atual".
// - O hash da classificação bancária (`hashDaClassificacao`) é o do original byte a byte.
// - Toda escrita trava a fatura (`FOR UPDATE`, o `_get_fatura_or_404(..., for_update=True)`) e avança a
//   versão da distribuição por `updateMany` condicionado à versão vista (`_avancar`). A consulta
//   (`obterDistribuicao`) NÃO trava (divergência deliberada da D0, decisão do Angelo em 26/11/2026): a tela
//   a repete a cada 2 s enquanto um documento é lido, e o original, que travava, fazia essa consulta
//   esperar pelas escritas e segurá-las. Ela lê numa transação só, para ver um retrato consistente.
// - Documento: o PDF vai para o disco (`originaisFaturas.ts`), a linha nasce "processando" e a leitura
//   (`lerDocumentoFatura`) roda depois da resposta (`after`), como a `BackgroundTask` do original. Uma leitura
//   presa há mais que o prazo da imagem mais 60 s aparece como falha e pode ser reenviada
//   (`leitura_expirada`). Nenhuma compra entra sem a revisão (`confirmarDocumento`).
// - Auditoria: a rota registra. Cada escrita devolve as auditorias com os dados do `_auditar` do original.

import { createHash } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { dec, reescala, texto, type Dec } from "../motor/decimal";
import { motivoParaNaoContabilizar, type Dc } from "../motor/regras";
import { decDoBanco, dia, empresaDoTenant, NAO_ENCONTRADA, paraBanco } from "./base";
import {
  conferirAplicar,
  conferirConfirmacao,
  conferirDesfazer,
  conferirSalvar,
  conflito,
  CONTAS_INVALIDAS,
  DOCUMENTO_NAO_ENCONTRADO,
  FATURA_NAO_ENCONTRADA,
  hashDaClassificacao,
  idDoGastoConfirmado,
  invalida,
  leituraExpirada,
  naoEncontrado,
  nomeDoDocumento,
  revisaoGuardada,
  SEGUNDOS_DA_LEITURA,
  validarAplicarDistribuicao,
  validarComponente,
  validarConfirmacao,
  validarDesfazerDistribuicao,
  validarSalvarDistribuicao,
  vistaDaDistribuicao,
  type AplicacaoGuardada,
  type ComponenteGuardado,
  type Distribuicoes,
  type DocumentoDaFatura,
  type EstadoDaDistribuicao,
  type GastoDaFatura,
  type ItemRevisado,
  type PagamentoDaFatura,
  type PartidaDoPagamento,
  type RecusaCartao,
  type ResultadoCartao,
  type VistaDaDistribuicao,
} from "../cartoes/servico";
import { lerDocumentoFatura, mensagemDaFalha, RecusaDoDocumento, validarItens } from "../cartoes/documentos";
import { lerFatura, type AuditoriaDoCartao, type Escrita, type Tx } from "./cartoes";
import { alterarComposicaoNaTransacao, lerComposicaoTx } from "./neoAvancado";
import { cancelarLancamento, contaBancaria, gravarDecisao, gravarPartidas, tomar } from "./neo";
import { iaLiberadaParaDocumentos } from "./notas";
import { apagarArquivo, chaveDoArquivo, gravarArquivo, lerArquivo } from "./originaisFaturas";

export const ACOES_DAS_FATURAS = {
  distribuicaoSalva: "contabil.core.fatura.distribuicao.salva", // fatura.distribuicao_salva
  distribuicaoAplicada: "contabil.core.fatura.distribuicao.aplicada", // fatura.distribuicao_aplicada
  distribuicaoDesfeita: "contabil.core.fatura.distribuicao.desfeita", // fatura.distribuicao_desfeita
  documentoAdicionado: "contabil.core.fatura.documento.adicionado", // fatura.documento_adicionado
  documentoRelido: "contabil.core.fatura.documento.relido", // (o original não auditava)
  documentoRevisado: "contabil.core.fatura.documento.revisado", // fatura.documento_revisado
  // O que a aplicação e o desfazer fazem no NEO, com as ações que o Connect já usa.
  composicaoAlterada: "contabil.core.composicao.alterada", // neo.composicao_alterada
  lancamentoCancelado: "contabil.core.lancamento.cancelado", // neo.lancamento_cancelado
} as const;

const TEMPO_DA_TRANSACAO = { timeout: 60_000 };
const VERSAO_MUDOU = "A distribuição mudou. Atualize a tela antes de salvar.";

/** Uma recusa que desfaz a transação inteira (a exceção do original no meio do serviço). */
class Recusada extends Error {
  constructor(readonly recusa: RecusaCartao) {
    super(recusa.erro);
  }
}
const recusar = (r: RecusaCartao): never => {
  throw new Recusada(r);
};

// ─── Leituras ───────────────────────────────────────────────────────────────

type Contexto = { tenantId: string; empresaId: string; cartaoId: string; faturaId: string; userId: string | null };
type Fatura = NonNullable<Awaited<ReturnType<typeof lerFatura>>>;

function lerAplicacao(v: Prisma.JsonValue | null): AplicacaoGuardada | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as unknown as AplicacaoGuardada) : null;
}

/** `_estado`: a linha da distribuição da fatura; com `criar`, nasce com a versão 0 e sem componentes. */
async function lerEstado(tx: Tx, c: Contexto, criar: boolean): Promise<(EstadoDaDistribuicao & { id: string }) | null> {
  let e = await tx.coreFaturaDistribuicao.findFirst({ where: { faturaId: c.faturaId, empresaId: c.empresaId }, select: { id: true, versao: true, distribuicoes: true, aplicacao: true } });
  if (!e && criar) {
    e = await tx.coreFaturaDistribuicao.create({
      data: { tenantId: c.tenantId, empresaId: c.empresaId, faturaId: c.faturaId, versao: 0, distribuicoes: {} },
      select: { id: true, versao: true, distribuicoes: true, aplicacao: true },
    });
  }
  if (!e) return null;
  return { id: e.id, versao: e.versao, distribuicoes: (e.distribuicoes ?? {}) as Distribuicoes, aplicacao: lerAplicacao(e.aplicacao) };
}

/** `_avancar`: a versão vista vira a seguinte, ou nada é gravado. */
async function avancar(tx: Tx, estado: { id: string; versao: number }, versao: number): Promise<number> {
  const r = await tx.coreFaturaDistribuicao.updateMany({ where: { id: estado.id, versao }, data: { versao: versao + 1 } });
  if (r.count !== 1) recusar(conflito(VERSAO_MUDOU));
  estado.versao = versao + 1;
  return estado.versao;
}

/** `_itens`: os gastos vivos, pela data da compra e pelo id. */
async function lerGastos(tx: Tx, c: Contexto): Promise<GastoDaFatura[]> {
  const linhas = await tx.coreLancamentoCartao.findMany({
    where: { faturaId: c.faturaId, empresaId: c.empresaId, deletedAt: null },
    select: { id: true, dataCompra: true, descricao: true, valor: true },
    orderBy: [{ dataCompra: "asc" }, { id: "asc" }],
  });
  return linhas.map((l) => ({ id: l.id, dataCompra: dia(l.dataCompra), descricao: l.descricao, valor: reescala(decDoBanco(l.valor), -2) }));
}

/** `_pagamento`: a transação viva que pagou a fatura, travada (a consulta da D0 lê sem travar). */
async function lerPagamento(tx: Tx, c: Contexto, transacaoId: string | null, travar = true): Promise<PagamentoDaFatura | null> {
  if (!transacaoId) return null;
  if (travar) await tx.$queryRaw`SELECT id FROM core_transacoes WHERE id = ${transacaoId} FOR UPDATE`;
  const t = await tx.coreTransacao.findFirst({
    where: { id: transacaoId, empresaId: c.empresaId, deletedAt: null },
    select: { id: true, valor: true, data: true, dc: true, status: true, agenciaId: true, historico: true },
  });
  return t ? { id: t.id, valor: reescala(decDoBanco(t.valor), -2), data: dia(t.data), dc: t.dc, status: t.status, agenciaId: t.agenciaId, historico: t.historico } : null;
}

/** `_partidas`: as partidas vivas da transação, pelo id. */
async function lerPartidas(tx: Tx, c: Contexto, transacaoId: string | null): Promise<PartidaDoPagamento[]> {
  if (!transacaoId) return [];
  const linhas = await tx.coreRegistro.findMany({
    where: { transacaoId, empresaId: c.empresaId, deletedAt: null },
    select: { id: true, contaId: true, valor: true, historico: true, dc: true },
    orderBy: { id: "asc" },
  });
  return linhas.map((p) => ({ id: p.id, contaId: p.contaId, valor: reescala(decDoBanco(p.valor), -2), historico: p.historico, dc: p.dc }));
}

async function hashAtual(tx: Tx, c: Contexto, transacaoId: string | null, pagamento: PagamentoDaFatura | null): Promise<string> {
  return hashDaClassificacao(await lerPartidas(tx, c, transacaoId), pagamento);
}

async function lerDocumentos(tx: Tx, c: Contexto): Promise<DocumentoDaFatura[]> {
  const linhas = await tx.coreFaturaDocumento.findMany({
    where: { faturaId: c.faturaId, empresaId: c.empresaId },
    select: { id: true, nome: true, status: true, resultado: true, erro: true, updatedAt: true, storageKey: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return linhas.map((d) => ({ id: d.id, nome: d.nome, status: d.status, resultado: d.resultado, erro: d.erro, atualizadoEm: d.updatedAt, temArquivo: d.storageKey !== null }));
}

/** `obter`, dentro da transação de quem chama. Sem `travar`, o pagamento é lido sem `FOR UPDATE` (a consulta). */
async function vista(tx: Tx, c: Contexto, f: Fatura, travar = true): Promise<VistaDaDistribuicao> {
  const estado = await lerEstado(tx, c, false);
  const itens = await lerGastos(tx, c);
  const pagamento = await lerPagamento(tx, c, f.transacaoId, travar);
  const hash = await hashAtual(tx, c, f.transacaoId, pagamento);
  return vistaDaDistribuicao(estado, itens, hash, f.transacaoId, await lerDocumentos(tx, c));
}

/**
 * Roda `passo` com a fatura travada, numa transação; a `Recusada` desfaz tudo e vira a recusa. Toda escrita
 * passa por aqui travando; só a consulta (`obterDistribuicao`) pede `travar` falso.
 */
async function naFatura<T>(c: Contexto, passo: (tx: Tx, f: Fatura) => Promise<T>, travar = true): Promise<ResultadoCartao<T>> {
  if (!(await empresaDoTenant(c.tenantId, c.empresaId))) return naoEncontrado(NAO_ENCONTRADA);
  try {
    const valor = await getPrisma().$transaction(async (tx) => {
      const f = await lerFatura(tx, c.tenantId, c.empresaId, c.cartaoId, c.faturaId, travar);
      if (!f) recusar(naoEncontrado(FATURA_NAO_ENCONTRADA));
      return passo(tx, f!);
    }, TEMPO_DA_TRANSACAO);
    return { ok: true, valor };
  } catch (e) {
    if (e instanceof Recusada) return e.recusa;
    throw e;
  }
}

const auditoriaDaFatura = (c: Contexto, f: Fatura, acao: string, dados: Record<string, unknown>): AuditoriaDoCartao => ({
  entidade: "CoreFaturaCartao",
  entidadeId: c.faturaId,
  acao,
  dados: { nome: `${f.cartao.nome} ${f.competencia}`, fatura_id: c.faturaId, ...dados },
});

// ─── Obter e salvar ─────────────────────────────────────────────────────────

/**
 * `obter`. O original travava a fatura (e o pagamento) para ler; aqui a consulta só lê, sem `FOR UPDATE`
 * (divergência deliberada da D0). Nada é gravado: `lerEstado` não cria a linha e a leitura expirada é
 * calculada na vista.
 */
export function obterDistribuicao(c: Contexto): Promise<ResultadoCartao<VistaDaDistribuicao>> {
  return naFatura(c, (tx, f) => vista(tx, c, f, false), false);
}

/** As contas analíticas, vivas, desta empresa, entre as pedidas. */
async function contasAnaliticas(tx: Tx, c: Contexto, ids: Set<string>): Promise<Set<string>> {
  if (!ids.size) return new Set();
  const linhas = await tx.corePlanoConta.findMany({ where: { id: { in: [...ids] }, empresaId: c.empresaId, deletedAt: null, tipoSa: "A" }, select: { id: true } });
  return new Set(linhas.map((l) => l.id));
}
const mesmas = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** `salvar`: os componentes de cada gasto, sem passar do valor dele, em contas analíticas desta empresa. */
export async function salvarDistribuicao(c: Contexto, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<VistaDaDistribuicao>>> {
  const v = validarSalvarDistribuicao(corpo);
  if (!v.ok) return invalida(v.erro);
  return naFatura(c, async (tx, f) => {
    const estado = (await lerEstado(tx, c, true))!;
    const r = conferirSalvar(estado, await lerGastos(tx, c), v.valor.distribuicoes);
    if ("ok" in r) recusar(r);
    const { contas } = r as { contas: Set<string> };
    if (!mesmas(contas, await contasAnaliticas(tx, c, contas))) recusar(invalida(CONTAS_INVALIDAS));
    const versao = await avancar(tx, estado, v.valor.versao);
    await tx.coreFaturaDistribuicao.update({ where: { id: estado.id }, data: { distribuicoes: v.valor.distribuicoes as Prisma.InputJsonValue } });
    return {
      valor: await vista(tx, c, f),
      auditoria: [auditoriaDaFatura(c, f, ACOES_DAS_FATURAS.distribuicaoSalva, { versao, distribuicoes: v.valor.distribuicoes })],
    };
  });
}

// ─── Aplicar e desfazer ─────────────────────────────────────────────────────

type Composicao = { transacao_id: string; transacao_historico: string; transacao_valor: string; transacao_dc: string; lancamento_vigente_id: string; componentes: (ComponenteGuardado & { lancamento_id: string })[] };

/** `obter_composicao` (o `NeoComposicaoResponse.model_dump(mode="json")`), ou a recusa. */
async function composicao(tx: Tx, c: Contexto, transacaoId: string): Promise<Composicao> {
  const r = await lerComposicaoTx(tx, c.empresaId, transacaoId);
  if (typeof r === "string") recusar(r === "Transação bancária não encontrada." ? naoEncontrado(r) : conflito(r));
  const ok = r as Exclude<typeof r, string>;
  return {
    transacao_id: ok.t.id,
    transacao_historico: ok.t.historico,
    transacao_valor: texto(reescala(decDoBanco(ok.t.valor), -2)),
    transacao_dc: ok.t.dc,
    lancamento_vigente_id: ok.componentes[0].lancamentoId,
    componentes: ok.componentes.map((p) => ({ lancamento_id: p.lancamentoId, conta_id: p.contaId, historico: p.historico, valor: texto(reescala(decDoBanco(p.valor.toString()), -2)) })),
  };
}

/** `alterar_composicao` na transação; a recusa desfaz tudo. Devolve a auditoria da composição. */
async function compor(tx: Tx, c: Contexto, transacaoId: string, vigente: string, componentes: { contaId: string; valor: Dec; historico: string }[], motivo: string, historicoDoExtrato: string): Promise<AuditoriaDoCartao> {
  const contas = new Set(componentes.map((x) => x.contaId));
  const achadas = await tx.corePlanoConta.count({ where: { id: { in: [...contas] }, empresaId: c.empresaId, deletedAt: null } });
  if (achadas !== contas.size) recusar(invalida("Uma das contas contábeis não pertence a esta empresa."));
  const r = await alterarComposicaoNaTransacao(tx, { tenantId: c.tenantId, empresaId: c.empresaId }, c.userId, { transacaoId, lancamentoVigenteId: vigente, componentes, motivo });
  if (!r.ok) recusar(r.erro.includes("mudou") || r.erro.includes("pares") || r.erro.includes("vigente") ? conflito(r.erro) : invalida(r.erro));
  const { antes, depois } = (r as Extract<typeof r, { ok: true }>).valor;
  return { entidade: "CoreTransacao", entidadeId: transacaoId, acao: ACOES_DAS_FATURAS.composicaoAlterada, dados: { nome: historicoDoExtrato, motivo, antes, depois } };
}

/**
 * `classificar_manualmente_lote([pagamento], conta do primeiro componente, histórico do pagamento)`, dentro
 * da transação: a recusa (valor suspeito, sem histórico) volta como `ValidationError`, como no original.
 */
async function classificarPagamento(tx: Tx, c: Contexto, pagamento: PagamentoDaFatura, contaId: string): Promise<void> {
  const t = await tx.coreTransacao.findFirst({
    where: { id: pagamento.id, empresaId: c.empresaId, status: "pendente", deletedAt: null },
    select: { id: true, agenciaId: true, historico: true, dc: true, valor: true, data: true },
  });
  if (!t) recusar(invalida("Associe um pagamento bancário de saída vigente à fatura."));
  const bloqueio = motivoParaNaoContabilizar({ historico: t!.historico, valor: decDoBanco(t!.valor) });
  if (bloqueio) recusar(invalida(bloqueio));
  const historico = t!.historico;
  if (!historico.trim()) recusar(invalida("O lançamento não possui histórico. Informe um histórico contábil."));
  const contaBanco = await contaBancaria(c.tenantId, c.empresaId, t!.agenciaId);
  if (!(await tomar(tx, t!, { automatico: false }))) recusar(conflito("A classificação bancária mudou. Atualize a tela."));
  const base = { tenantId: c.tenantId, empresaId: c.empresaId };
  await gravarPartidas(tx, base, t!, { contaId, descricao: historico, historico, dc: t!.dc as Dc, tipoRegra: "manual" }, contaBanco);
  await gravarDecisao(tx, base, t!.id, { resultado: "associada", contaId, estrategia: "manual", motivo: `Associação manual: ${historico}` });
}

/** `aplicar`: a distribuição vira a composição do pagamento. */
export async function aplicarDistribuicao(c: Contexto, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<VistaDaDistribuicao>>> {
  const v = validarAplicarDistribuicao(corpo);
  if (!v.ok) return invalida(v.erro);
  const { versao: vista0, classificacaoHash, motivo } = v.valor;
  return naFatura(c, async (tx, f) => {
    const estado = (await lerEstado(tx, c, true))!;
    const itens = await lerGastos(tx, c);
    const pagamento = await lerPagamento(tx, c, f.transacaoId);
    const hash = pagamento ? await hashAtual(tx, c, pagamento.id, pagamento) : hashDaClassificacao([], null);
    const r = conferirAplicar(estado, itens, f.competencia, pagamento, hash, classificacaoHash);
    if ("ok" in r) recusar(r);
    const { componentes } = r as Exclude<typeof r, RecusaCartao>;
    const contas = new Set(componentes.map((x) => x.contaId));
    if (!mesmas(contas, await contasAnaliticas(tx, c, contas))) recusar(invalida("Uma conta da distribuição não está mais disponível."));
    const versao = await avancar(tx, estado, vista0);
    const p = pagamento!;
    let antes: Composicao | null = null;
    if (p.status === "processada") antes = await composicao(tx, c, p.id);
    else {
      if ((await lerPartidas(tx, c, p.id)).length) recusar(conflito("Pagamento pendente com partidas vigentes: revise no NEO."));
      await classificarPagamento(tx, c, p, componentes[0].contaId);
    }
    const vigente = await composicao(tx, c, p.id);
    const auditoriaDoNeo = await compor(tx, c, p.id, vigente.lancamento_vigente_id, componentes, motivo, p.historico);
    const depois = await lerPagamento(tx, c, p.id);
    const aplicacao: AplicacaoGuardada = { antes, transacao_id: p.id, hash: await hashAtual(tx, c, p.id, depois) };
    await tx.coreFaturaDistribuicao.update({ where: { id: estado.id }, data: { aplicacao: aplicacao as unknown as Prisma.InputJsonValue } });
    return {
      valor: await vista(tx, c, f),
      auditoria: [auditoriaDoNeo, auditoriaDaFatura(c, f, ACOES_DAS_FATURAS.distribuicaoAplicada, { versao, aplicacao })],
    };
  });
}

/** `desfazer`: devolve a classificação de antes, ou encerra o controle preservando a atual. */
export async function desfazerDistribuicao(c: Contexto, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<VistaDaDistribuicao>>> {
  const v = validarDesfazerDistribuicao(corpo);
  if (!v.ok) return invalida(v.erro);
  const { versao: vista0, motivo, preservarAtual } = v.valor;
  return naFatura(c, async (tx, f) => {
    const estado = (await lerEstado(tx, c, true))!;
    if (!estado.aplicacao) recusar(conflito("Não há distribuição aplicada para desfazer."));
    const pagamento = await lerPagamento(tx, c, f.transacaoId);
    const atual = await hashAtual(tx, c, f.transacaoId, pagamento);
    const r = conferirDesfazer(estado, atual, preservarAtual);
    if ("ok" in r) recusar(r);
    const antiga = estado.aplicacao!;
    await avancar(tx, estado, vista0);
    const auditoria: AuditoriaDoCartao[] = [];
    if ((r as { restaurar: boolean }).restaurar && pagamento) {
      const vigente = await composicao(tx, c, pagamento.id);
      if (antiga.antes) {
        const componentes = antiga.antes.componentes.map((x) => {
          const comp = validarComponente(x);
          if (!comp.ok) recusar(invalida(comp.erro));
          return (comp as Extract<typeof comp, { ok: true }>).valor;
        });
        auditoria.push(await compor(tx, c, pagamento.id, vigente.lancamento_vigente_id, componentes, motivo, pagamento.historico));
      } else {
        const n = await cancelarLancamento(tx, { tenantId: c.tenantId, empresaId: c.empresaId }, pagamento.id, motivo, c.userId);
        if (!n.partidas) recusar(naoEncontrado("Lançamento não encontrado ou já cancelado."));
        auditoria.push({
          entidade: "CoreTransacao",
          entidadeId: pagamento.id,
          acao: ACOES_DAS_FATURAS.lancamentoCancelado,
          dados: { nome: pagamento.historico, motivo, partidas: n.partidas, notas_desvinculadas: n.notasDesvinculadas, comprovantes_desvinculados: n.comprovantesDesvinculados },
        });
      }
    }
    await tx.coreFaturaDistribuicao.update({ where: { id: estado.id }, data: { aplicacao: Prisma.DbNull } });
    auditoria.push(auditoriaDaFatura(c, f, ACOES_DAS_FATURAS.distribuicaoDesfeita, { motivo, preservar_atual: preservarAtual, aplicacao: antiga }));
    return { valor: await vista(tx, c, f), auditoria };
  });
}

// ─── Documentos ─────────────────────────────────────────────────────────────

const MAX_BYTES = 25 * 1024 * 1024;
const LIMITE_DA_FATURA = { documentos: 32, bytes: 100 * 1024 * 1024 };

const ehPdf = (b: Uint8Array) => b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

/**
 * `adicionar_documento`: o PDF (até 25 MiB) entra "processando"; o mesmo arquivo não entra duas vezes na
 * fatura, e a fatura aceita até 32 documentos e 100 MiB. Quem chama dispara a leitura depois da resposta.
 */
export async function adicionarDocumento(c: Contexto, conteudo: Uint8Array, nome: string): Promise<ResultadoCartao<Escrita<{ id: string; status: string }>>> {
  let gravado: string | null = null;
  try {
    return await naFatura(c, async (tx, f) => {
      if (!ehPdf(conteudo) || conteudo.length > MAX_BYTES) recusar(invalida("Envie um PDF de até 25 MiB."));
      const hash = createHash("sha256").update(conteudo).digest("hex");
      const existente = await tx.coreFaturaDocumento.findFirst({ where: { faturaId: c.faturaId, hashArquivo: hash }, select: { id: true } });
      if (existente) recusar(conflito("Este documento já está anexado. Consulte a leitura existente."));
      const soma = await tx.coreFaturaDocumento.aggregate({ where: { faturaId: c.faturaId }, _count: { _all: true }, _sum: { tamanho: true } });
      if (soma._count._all >= LIMITE_DA_FATURA.documentos || (soma._sum.tamanho ?? 0) + conteudo.length > LIMITE_DA_FATURA.bytes) {
        recusar(invalida("Limite de documentos da fatura atingido."));
      }
      const d = await tx.coreFaturaDocumento.create({
        data: { tenantId: c.tenantId, empresaId: c.empresaId, faturaId: c.faturaId, nome: nomeDoDocumento(nome), hashArquivo: hash, tamanho: conteudo.length, status: "processando", resultado: {} },
        select: { id: true, status: true },
      });
      const chave = chaveDoArquivo(c.tenantId, d.id);
      await tx.coreFaturaDocumento.update({ where: { id: d.id }, data: { storageKey: chave } });
      gravado = chave;
      await gravarArquivo(c.tenantId, chave, conteudo);
      return { valor: d, auditoria: [auditoriaDaFatura(c, f, ACOES_DAS_FATURAS.documentoAdicionado, { documento_id: d.id, hash })] };
    });
  } catch (e) {
    if (gravado) await apagarArquivo(c.tenantId, gravado);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return conflito("Este documento já está anexado. Consulte a leitura existente.");
    throw e;
  }
}

/** `reler_documento_fatura`: só a leitura que falhou (ou que ficou presa) volta para "processando". */
export async function relerDocumento(c: Contexto, documentoId: string): Promise<ResultadoCartao<Escrita<{ id: string; status: string }>>> {
  return naFatura(c, async (tx, f) => {
    const d = await tx.coreFaturaDocumento.findFirst({ where: { id: documentoId, faturaId: c.faturaId, empresaId: c.empresaId }, select: { id: true, status: true, updatedAt: true } });
    if (!d) recusar(naoEncontrado(DOCUMENTO_NAO_ENCONTRADO));
    if (d!.status !== "falhou" && !leituraExpirada({ status: d!.status, atualizadoEm: d!.updatedAt })) recusar(conflito("Somente leituras que falharam podem ser reenviadas."));
    const r = await tx.coreFaturaDocumento.updateMany({ where: { id: d!.id, status: d!.status, updatedAt: d!.updatedAt }, data: { status: "processando", erro: null } });
    if (r.count !== 1) recusar(conflito("O documento mudou. Atualize a tela."));
    return { valor: { id: d!.id, status: "processando" }, auditoria: [auditoriaDaFatura(c, f, ACOES_DAS_FATURAS.documentoRelido, { documento_id: d!.id })] };
  });
}

/** O tempo da leitura em segundo plano: o da imagem mais 10 s (`pdf_vision_timeout_seconds + 10`). */
const TEMPO_DA_LEITURA_MS = (SEGUNDOS_DA_LEITURA + 10) * 1000;

/**
 * `processar_documento`: lê o PDF fora de qualquer transação e grava o rascunho ("revisar") ou a falha
 * ("falhou", com a frase), só se o documento ainda estiver na MESMA tentativa ("processando" e o mesmo
 * `updatedAt`). Uma falha de leitura nunca altera gastos já existentes.
 */
export async function processarDocumento(documentoId: string, userId: string | null): Promise<void> {
  const prisma = getPrisma();
  let tentativa: Date | null = null;
  try {
    const d = await prisma.coreFaturaDocumento.findUnique({
      where: { id: documentoId },
      select: { status: true, updatedAt: true, tenantId: true, empresaId: true, storageKey: true, fatura: { select: { competencia: true } }, empresa: { select: { ativa: true, deletedAt: true } } },
    });
    if (!d || d.status !== "processando") return;
    tentativa = d.updatedAt;
    if (!d.empresa.ativa || d.empresa.deletedAt !== null) throw new RecusaDoDocumento("A empresa está inativa. Reative antes de processar documentos.");
    const conteudo = d.storageKey ? await lerArquivo(d.tenantId, d.storageKey) : null;
    if (!conteudo) throw new Error("arquivo da fatura não encontrado");
    const quem = { tenantId: d.tenantId, documentosFinanceirosLiberados: await iaLiberadaParaDocumentos(d.tenantId), contexto: { userId, entityType: "core_empresa", entityId: d.empresaId } };
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const limite = new Promise<never>((_, rejeitar) => {
      relogio = setTimeout(() => rejeitar(new Error("tempo esgotado")), TEMPO_DA_LEITURA_MS);
    });
    const resultado = await Promise.race([lerDocumentoFatura(new Uint8Array(conteudo), d.fatura.competencia, quem), limite]).finally(() => clearTimeout(relogio));
    await prisma.coreFaturaDocumento.updateMany({
      where: { id: documentoId, status: "processando", updatedAt: tentativa },
      data: { resultado: resultado as unknown as Prisma.InputJsonValue, status: "revisar", erro: null },
    });
  } catch (e) {
    if (tentativa === null) return;
    if (!(e instanceof RecusaDoDocumento)) console.error("[contabil-core] faturas: leitura do documento", e instanceof Error ? e.name : "erro");
    await prisma.coreFaturaDocumento.updateMany({ where: { id: documentoId, status: "processando", updatedAt: tentativa }, data: { status: "falhou", erro: mensagemDaFalha(e) } });
  }
}

/** `confirmar_documento`: a revisão vira a fonte principal (os gastos da fatura) ou fica complementar. */
export async function confirmarDocumento(c: Contexto, documentoId: string, corpo: Record<string, unknown>): Promise<ResultadoCartao<Escrita<VistaDaDistribuicao>>> {
  const v = validarConfirmacao(corpo);
  if (!v.ok) return invalida(v.erro);
  const dados = v.valor;
  return naFatura(c, async (tx, f) => {
    const doc = await tx.coreFaturaDocumento.findFirst({ where: { id: documentoId, faturaId: c.faturaId, empresaId: c.empresaId }, select: { id: true, status: true, resultado: true } });
    if (!doc) recusar(naoEncontrado(DOCUMENTO_NAO_ENCONTRADO));
    const estado = (await lerEstado(tx, c, true))!;
    const atuais = await lerGastos(tx, c);
    const validar = (itens: ItemRevisado[], total: string): ItemRevisado[] => {
      try {
        return validarItens(itens, total);
      } catch (e) {
        if (e instanceof RecusaDoDocumento) return recusar(invalida(e.message));
        throw e;
      }
    };
    const r = conferirConfirmacao(doc!, estado, f, dados, atuais.length > 0, validar);
    if ("ok" in r) recusar(r);
    const { itens } = r as { itens: ItemRevisado[] | null };
    if (itens) {
      if (atuais.length) await tx.coreLancamentoCartao.updateMany({ where: { id: { in: atuais.map((a) => a.id) } }, data: { deletedAt: new Date() } });
      await tx.coreLancamentoCartao.createMany({
        data: itens.map((i, n) => ({
          id: idDoGastoConfirmado(doc!.id, dados.versao, n),
          tenantId: c.tenantId,
          empresaId: c.empresaId,
          faturaId: c.faturaId,
          dataCompra: new Date(`${i.data}T00:00:00.000Z`),
          descricao: i.descricao,
          valor: paraBanco(dec(i.valor)),
        })),
      });
      await tx.coreFaturaDistribuicao.update({ where: { id: estado.id }, data: { distribuicoes: {} } });
      await tx.coreFaturaDocumento.updateMany({ where: { faturaId: c.faturaId, empresaId: c.empresaId, status: "principal", id: { not: doc!.id } }, data: { status: "complementar" } });
    }
    const versao = await avancar(tx, estado, dados.versao);
    const anterior = doc!.resultado && typeof doc!.resultado === "object" && !Array.isArray(doc!.resultado) ? (doc!.resultado as Record<string, unknown>) : {};
    await tx.coreFaturaDocumento.update({
      where: { id: doc!.id },
      data: { status: dados.principal ? "principal" : "complementar", resultado: { ...anterior, revisao: revisaoGuardada(dados), revisado_por: c.userId } as Prisma.InputJsonValue },
    });
    return {
      valor: await vista(tx, c, f),
      auditoria: [auditoriaDaFatura(c, f, ACOES_DAS_FATURAS.documentoRevisado, { documento_id: doc!.id, principal: dados.principal, versao })],
    };
  });
}

/** `original_documento_fatura`: o PDF do documento desta fatura. */
export async function arquivoDoDocumento(c: Contexto, documentoId: string): Promise<ResultadoCartao<Buffer>> {
  if (!(await empresaDoTenant(c.tenantId, c.empresaId))) return naoEncontrado(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const f = await lerFatura(prisma as unknown as Tx, c.tenantId, c.empresaId, c.cartaoId, c.faturaId, false);
  if (!f) return naoEncontrado(FATURA_NAO_ENCONTRADA);
  const d = await prisma.coreFaturaDocumento.findFirst({ where: { id: documentoId, faturaId: c.faturaId, empresaId: c.empresaId }, select: { storageKey: true } });
  if (!d) return naoEncontrado(DOCUMENTO_NAO_ENCONTRADO);
  const bytes = d.storageKey ? await lerArquivo(c.tenantId, d.storageKey) : null;
  if (!bytes) return naoEncontrado("O arquivo deste documento não foi encontrado no servidor.");
  return { ok: true, valor: bytes };
}

export type { Contexto as ContextoDaFatura };
