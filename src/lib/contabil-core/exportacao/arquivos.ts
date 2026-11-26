// As exportações do Contábil Core (Bloco D, Fase D1, 26/11/2026): porte de `ExportacaoService`
// (`src/domain/exportacao/service.py`) e de `formatos.py`, sem banco. O servidor (`servidor/exportacao.ts`)
// lê as linhas da empresa e entrega aqui; daqui sai o arquivo.
//
// Tipos e formatos, como no original:
// - `lancamentos`: as partidas vigentes do razão (CSV e XLSX);
// - `lancamentos_importacao`: o arquivo do Domínio (TXT, CSV e XLSX; a Fase 2 já portava TXT e CSV);
// - `extrato`: as transações com os filtros da tela;
// - `nfe_entrada`, `nfe_saida`, `nfse_tomado`, `nfse_prestado`: as baixas de notas;
// - `conferencia`: transação × nota × comprovante, com a divergência assinada.
//
// Fidelidade conferida pelo gabarito (`exportacao/gabarito/`, gerado por `scripts/contabil-core/gabarito_exportacao.py`):
// as mesmas colunas, na mesma ordem, a mesma formatação de número e de data, as mesmas recusas. O CSV sai
// byte a byte; o XLSX, com o mesmo conteúdo (valor, tipo, negrito e folha), lido de volta. As divergências
// deliberadas estão em docs/CONTABIL-CORE.md ("Fase D1") e são contadas no teste.

import { compara, dec, modulo, oposto, reescala, soma, subtrai, type Dec } from "../motor/decimal";
import { COLUNAS_LANCAMENTOS_IMPORTACAO, type Linha } from "../motor/dominio";
import { linhasDoDominio, type ContaParaExportar } from "../motor/exportacao";
import type { Dc } from "../motor/regras";
import { strip } from "../motor/unicodePy";
import { cnpjValido } from "../notas/servico";

// ─── Tipos e formatos ─────────────────────────────────────────────────────

export const TIPOS_DE_EXPORTACAO = [
  "lancamentos", "lancamentos_importacao", "extrato", "nfe_entrada", "nfe_saida", "nfse_tomado", "nfse_prestado", "conferencia",
] as const;
export type TipoDeExportacao = (typeof TIPOS_DE_EXPORTACAO)[number];
export type FormatoDeExportacao = "csv" | "xlsx" | "txt";
export const TIPOS_DE_NOTA = ["nfe_entrada", "nfe_saida", "nfse_tomado", "nfse_prestado"] as const;

export const COLUNAS_LANCAMENTOS = [
  "id", "data_lancamento", "historico", "historico_extrato", "dc", "valor", "tipo_regra", "conta_id", "agencia_id", "transacao_id",
] as const;
export const COLUNAS_NOTAS = [
  "data_emissao", "numero", "serie", "cnpj_emitente", "nome_emitente", "cnpj_destinatario", "valor", "chave_acesso", "status",
  "data_transacao", "valor_transacao",
] as const;
export const COLUNAS_CONFERENCIA = [
  "data_transacao", "historico_extrato", "dc", "valor_transacao", "status_transacao", "nota_numero", "tipo_nota", "valor_nota",
  "favorecido_comprovante", "valor_pago_comprovante", "total_documentos", "divergencia_residual", "status_conciliacao",
] as const;
export const COLUNAS_EXTRATO = ["data", "agencia", "historico", "dc", "valor", "status"] as const;

/** O nome da folha do XLSX de cada tipo (`_new_workbook`/`_dicts_to_xlsx` do original). */
export const FOLHA_DO_TIPO: Record<TipoDeExportacao, string> = {
  lancamentos: "Lançamentos Contábeis",
  lancamentos_importacao: "Importação Lançamentos",
  extrato: "Extrato Bancário",
  nfe_entrada: "NF-e Entrada",
  nfe_saida: "NF-e Saída",
  nfse_tomado: "NFS-e Tomado",
  nfse_prestado: "NFS-e Prestado",
  conferencia: "Conferência",
};

export const FORMATO_INVALIDO = "Formato deve ser 'csv', 'xlsx' ou 'txt'.";
export const TXT_SO_NO_DOMINIO = "O formato 'txt' só está disponível para 'lancamentos_importacao' por enquanto.";

export type PedidoConferido = { ok: true; tipo: TipoDeExportacao; formato: FormatoDeExportacao } | { ok: false; erro: string };

/** As recusas de `exportar`, na ordem do original: formato, tipo e o TXT fora do Domínio. */
export function conferirPedido(formato: string, tipo: string | null | undefined): PedidoConferido {
  if (formato !== "csv" && formato !== "xlsx" && formato !== "txt") return { ok: false, erro: FORMATO_INVALIDO };
  const t = tipo || "lancamentos";
  if (!(TIPOS_DE_EXPORTACAO as readonly string[]).includes(t)) return { ok: false, erro: `Tipo de exportação inválido: '${t}'.` };
  if (formato === "txt" && t !== "lancamentos_importacao") return { ok: false, erro: TXT_SO_NO_DOMINIO };
  return { ok: true, tipo: t as TipoDeExportacao, formato };
}

// ─── Período ──────────────────────────────────────────────────────────────

/** Um limite do período: o instante (UTC, em ms) e o dia do calendário no fuso em que veio (o `.date()`). */
export type Limite = { ms: number; dia: string };
export type Periodo = { de: Limite | null; ate: Limite | null };

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * Data e hora ISO 8601 → limite, como o `datetime` do pydantic e a sessão do PostgreSQL em UTC: sem fuso,
 * vale como UTC; o dia é o do texto (o `.date()` do `datetime` com o fuso que veio). `null` se não é data.
 */
export function limite(texto: string): Limite | null {
  const m = ISO.exec(texto.trim());
  if (!m) return null;
  const [a, mes, d, h = "0", mi = "0", s = "0", frac = ""] = m.slice(1, 8);
  const fuso = m[8];
  let deslocamento = 0;
  if (fuso && fuso.toUpperCase() !== "Z") {
    const n = fuso.slice(1).replace(":", "");
    deslocamento = (fuso[0] === "-" ? -1 : 1) * (Number(n.slice(0, 2)) * 60 + Number(n.slice(2))) * 60_000;
  }
  const local = Date.UTC(Number(a), Number(mes) - 1, Number(d), Number(h), Number(mi), Number(s), Math.floor(Number((frac + "000").slice(0, 3))));
  if (Number.isNaN(local) || new Date(local).getUTCDate() !== Number(d)) return null;
  return { ms: local - deslocamento, dia: `${a}-${mes}-${d}` };
}

/** `bounds_do_mes`: do primeiro instante do mês ao último, em UTC. */
export function periodoDoMes(mes: string): Periodo {
  const [a, m] = mes.split("-").map(Number);
  const inicio = Date.UTC(a, m - 1, 1);
  const fim = Date.UTC(a, m, 1) - 1;
  return { de: { ms: inicio, dia: new Date(inicio).toISOString().slice(0, 10) }, ate: { ms: fim, dia: new Date(fim).toISOString().slice(0, 10) } };
}

/** O período do pedido: a competência, quando vem, tem precedência sobre as datas (como no original). */
export function periodoDoPedido(p: { mes?: string | null; dataDe?: string | null; dataAte?: string | null }): Periodo {
  if (p.mes) return periodoDoMes(p.mes);
  return { de: p.dataDe ? limite(p.dataDe) : null, ate: p.dataAte ? limite(p.dataAte) : null };
}

const dentroDoDia = (dia: string, p: Periodo) => (!p.de || dia >= p.de.dia) && (!p.ate || dia <= p.ate.dia);
const dentroDoInstante = (ms: number, p: Periodo) => (!p.de || ms >= p.de.ms) && (!p.ate || ms <= p.ate.ms);

// ─── O que o servidor lê ──────────────────────────────────────────────────

export type AgenciaExp = { id: string; bancoSigla: string; agencia: string; numero: string; digito: string | null; ativa: boolean; apagada: boolean };
export type TransacaoExp = {
  id: string; agenciaId: string; data: string; valor: Dec; historico: string; dc: string; status: string;
  ordem: number | null; importacaoId: string | null; apagada: boolean; criadoEm: Date;
};
export type RegistroExp = {
  id: string; lancamentoId: string; transacaoId: string | null; contaId: string; agenciaId: string; historico: string; historicoExtrato: string;
  dc: string; tipoRegra: string; valor: Dec; dataLancamento: Date; apagado: boolean; criadoEm: Date;
};
export type NotaExp = {
  id: string; tipo: string; numero: string | null; serie: string | null; cnpjEmitente: string | null; nomeEmitente: string | null;
  cnpjDestinatario: string | null; valor: Dec; dataEmissao: Date; status: string | null; transacaoId: string | null; chaveAcesso: string | null;
  apagada: boolean; criadoEm: Date;
};
export type ComprovanteExp = { id: string; transacaoId: string | null; favorecido: string | null; valorPago: Dec; apagado: boolean; criadoEm: Date };

/**
 * As linhas da empresa (o servidor já filtrou tenant e empresa; pode ter filtrado também o período). As
 * apagadas vêm marcadas, porque a nota mostra a transação ligada mesmo desfeita.
 */
export type DadosDaExportacao = {
  empresa: { id: string; cnpj: string; razaoSocial: string };
  agencias: AgenciaExp[];
  transacoes: TransacaoExp[];
  /** Instante de criação de cada lote de importação (a ordem do extrato). */
  importacoes: ReadonlyMap<string, Date>;
  registros: RegistroExp[];
  contas: ReadonlyMap<string, ContaParaExportar>;
  notas: NotaExp[];
  comprovantes: ComprovanteExp[];
};

export type PedidoDeExportacao = {
  tipo: TipoDeExportacao;
  periodo: Periodo;
  incluirContasInativas: boolean;
  usarHistoricoExtrato: boolean;
  agenciaId: string | null;
  /** Só no extrato. */
  status: string | null;
  historico: string | null;
  dc: string | null;
  valorMin: Dec | null;
  valorMax: Dec | null;
};

export type ArquivoMontado = {
  tipo: TipoDeExportacao;
  colunas: readonly string[];
  linhas: Linha[];
  folha: string;
  /** O `total_registros` do original: partidas, transações ou linhas, conforme o tipo. */
  total: number;
  contasSemCodigoAbreviado: string[];
  lancamentosSemPar: number;
};

// ─── Ordem ────────────────────────────────────────────────────────────────

/** Empate na coluna ordenada: o original não desempata (no PostgreSQL a ordem é a do disco); aqui, criação e id. */
function porCriacao(a: { criadoEm: Date; id: string }, b: { criadoEm: Date; id: string }): number {
  return a.criadoEm.getTime() - b.criadoEm.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** `ordenar_como_o_extrato`: dia, lote (o sem lote primeiro), posição no arquivo (a sem posição por último) e id. */
export function ordemDoExtrato(importacoes: ReadonlyMap<string, Date>) {
  const lote = (t: TransacaoExp) => (t.importacaoId ? importacoes.get(t.importacaoId)?.getTime() ?? null : null);
  return (a: TransacaoExp, b: TransacaoExp): number => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    const la = lote(a);
    const lb = lote(b);
    if (la !== lb) {
      if (la === null) return -1;
      if (lb === null) return 1;
      return la - lb;
    }
    if (a.ordem !== b.ordem) {
      if (a.ordem === null) return 1;
      if (b.ordem === null) return -1;
      return a.ordem - b.ordem;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

// ─── Formatação das células ───────────────────────────────────────────────

/** O `isoformat()` do `datetime` com fuso que o PostgreSQL devolve (sessão em UTC). */
export function isoformatUtc(d: Date): string {
  const iso = d.toISOString();
  const ms = d.getUTCMilliseconds();
  return `${iso.slice(0, 19)}${ms ? `.${String(ms).padStart(3, "0")}000` : ""}+00:00`;
}

const diaBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** `_valor_assinado`: o débito sai negativo. */
export function valorAssinado(valor: Dec, dc: string): Dec {
  return dc === "D" ? oposto(valor) : valor;
}

/** `_sanitize_cnpj`: só os dígitos (o `\D` do Python mantém os de outras escritas). */
export function cnpjSoDigitos(cnpj: string | null): string {
  return (cnpj ?? "").replace(/[^\p{Nd}]/gu, "");
}

/** A descrição da agência do original (`AgenciaBancaria.descricao`): sigla, agência, número e dígito. */
export function descricaoDaAgencia(a: Pick<AgenciaExp, "bancoSigla" | "agencia" | "numero" | "digito">): string {
  return [a.bancoSigla, a.agencia, a.numero, ...(a.digito ? [a.digito] : [])].join(" ");
}

// ─── Seleções ─────────────────────────────────────────────────────────────

/** As contas bancárias ativas da empresa (`_agencias_ativas`). */
function agenciasAtivas(d: DadosDaExportacao): Set<string> {
  return new Set(d.agencias.filter((a) => a.ativa && !a.apagada).map((a) => a.id));
}

/**
 * `_registros_vigentes`: as partidas vivas do período, das contas bancárias ativas (ou de todas, com a
 * opção), na ordem da data do lançamento. O cancelado não sai: cancelar não gera estorno, apaga a partida.
 */
export function registrosVigentes(d: DadosDaExportacao, p: PedidoDeExportacao): RegistroExp[] {
  const ativas = agenciasAtivas(d);
  return d.registros
    .filter(
      (r) =>
        !r.apagado &&
        (p.incluirContasInativas || ativas.has(r.agenciaId)) &&
        (!p.agenciaId || r.agenciaId === p.agenciaId) &&
        dentroDoInstante(r.dataLancamento.getTime(), p.periodo),
    )
    .sort((a, b) => a.dataLancamento.getTime() - b.dataLancamento.getTime() || porCriacao(a, b));
}

/**
 * A busca no histórico, como a da aba Extrato do Connect (o `contains` do MySQL, que ignora maiúscula e
 * acento, com `%` e `_` como texto). No original era o `ilike` do PostgreSQL: distingue acento e trata `%` e
 * `_` como curingas (ver as divergências).
 */
export type Busca = (historico: string, termo: string) => boolean;

export function casaNaBusca(historico: string, termo: string): boolean {
  const n = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return n(historico).includes(n(strip(termo)));
}

/** As transações do extrato com os filtros da tela (`_exportar_extrato`). A conta inativa entra: ela é escolhida na tela. */
export function transacoesDoExtrato(d: DadosDaExportacao, p: PedidoDeExportacao, busca: Busca = casaNaBusca): TransacaoExp[] {
  return d.transacoes
    .filter(
      (t) =>
        !t.apagada &&
        (!p.agenciaId || t.agenciaId === p.agenciaId) &&
        (!p.status || t.status === p.status) &&
        dentroDoDia(t.data, p.periodo) &&
        (!p.dc || t.dc === p.dc) &&
        (p.valorMin === null || compara(t.valor, p.valorMin) >= 0) &&
        (p.valorMax === null || compara(t.valor, p.valorMax) <= 0) &&
        (!p.historico || busca(t.historico, p.historico)),
    )
    .sort(ordemDoExtrato(d.importacoes));
}

/** As transações da conferência: vivas, do período, das contas ativas (ou todas), na ordem do extrato. */
export function transacoesDaConferencia(d: DadosDaExportacao, p: PedidoDeExportacao): TransacaoExp[] {
  const ativas = agenciasAtivas(d);
  return d.transacoes
    .filter(
      (t) =>
        !t.apagada &&
        (p.incluirContasInativas || ativas.has(t.agenciaId)) &&
        (!p.agenciaId || t.agenciaId === p.agenciaId) &&
        dentroDoDia(t.data, p.periodo),
    )
    // O original ordena só pela data; no empate, aqui vale a ordem do extrato (lote, posição no arquivo e id).
    .sort(ordemDoExtrato(d.importacoes));
}

// ─── Montagem de cada tipo ────────────────────────────────────────────────

export type Montagem = { ok: true; valor: ArquivoMontado } | { ok: false; erro: string; detalhes?: Record<string, string> };

function montado(tipo: TipoDeExportacao, colunas: readonly string[], linhas: Linha[], total: number, extra: Partial<ArquivoMontado> = {}): Montagem {
  return { ok: true, valor: { tipo, colunas, linhas, folha: FOLHA_DO_TIPO[tipo], total, contasSemCodigoAbreviado: [], lancamentosSemPar: 0, ...extra } };
}

function lancamentos(d: DadosDaExportacao, p: PedidoDeExportacao): Montagem {
  const rows = registrosVigentes(d, p);
  const linhas = rows.map(
    (r): Linha => ({
      id: r.id,
      data_lancamento: isoformatUtc(r.dataLancamento),
      historico: r.historico,
      historico_extrato: r.historicoExtrato,
      dc: r.dc,
      valor: r.valor,
      tipo_regra: r.tipoRegra,
      conta_id: r.contaId,
      agencia_id: r.agenciaId,
      transacao_id: r.transacaoId ?? "",
    }),
  );
  return montado("lancamentos", COLUNAS_LANCAMENTOS, linhas, rows.length);
}

function dominio(d: DadosDaExportacao, p: PedidoDeExportacao): Montagem {
  const partidas = registrosVigentes(d, p);
  const dcs = new Map<string, Dc>(d.transacoes.filter((t) => !t.apagada).map((t) => [t.id, t.dc as Dc]));
  const arquivo = linhasDoDominio(
    partidas.map((r) => ({ ...r, dc: r.dc as Dc, dataLancamento: r.dataLancamento.toISOString().slice(0, 10) })),
    d.contas,
    dcs,
    p.usarHistoricoExtrato,
  );
  return montado("lancamentos_importacao", COLUNAS_LANCAMENTOS_IMPORTACAO, arquivo.linhas, arquivo.linhas.length, {
    contasSemCodigoAbreviado: arquivo.contasSemCodigoAbreviado,
    lancamentosSemPar: arquivo.lancamentosSemPar,
  });
}

function extrato(d: DadosDaExportacao, p: PedidoDeExportacao, busca: Busca): Montagem {
  const transacoes = transacoesDoExtrato(d, p, busca);
  const agencias = new Map(d.agencias.map((a) => [a.id, descricaoDaAgencia(a)]));
  const linhas = transacoes.map(
    (t): Linha => ({ data: diaBr(t.data), agencia: agencias.get(t.agenciaId) ?? "", historico: t.historico, dc: t.dc, valor: t.valor, status: t.status }),
  );
  return montado("extrato", COLUNAS_EXTRATO, linhas, transacoes.length);
}

/** A recusa do CNPJ que não é CNPJ: comparar com ele faria a exportação de notas sair vazia, sem erro. */
export function recusaDoCnpj(empresa: DadosDaExportacao["empresa"]): { erro: string; detalhes: Record<string, string> } {
  return {
    erro:
      `A empresa '${empresa.razaoSocial}' está cadastrada com o CNPJ ${empresa.cnpj}, que não é um CNPJ válido. A exportação de notas ` +
      "identifica as notas da empresa comparando esse CNPJ com o emitente e o destinatário, então o resultado sairia vazio. Corrija o " +
      "CNPJ no cadastro da empresa e exporte novamente.",
    detalhes: { empresa_id: empresa.id, cnpj: empresa.cnpj },
  };
}

function notas(d: DadosDaExportacao, p: PedidoDeExportacao): Montagem {
  if (!cnpjValido(d.empresa.cnpj)) return { ok: false, ...recusaDoCnpj(d.empresa) };
  const cnpjEmpresa = cnpjSoDigitos(d.empresa.cnpj);
  const tipoNota = p.tipo.startsWith("nfe") ? "nfe" : "nfse";
  const entrada = p.tipo === "nfe_entrada" || p.tipo === "nfse_tomado";
  const escolhidas = d.notas
    .filter((n) => !n.apagada && n.tipo === tipoNota && dentroDoInstante(n.dataEmissao.getTime(), p.periodo))
    .sort((a, b) => a.dataEmissao.getTime() - b.dataEmissao.getTime() || porCriacao(a, b))
    .filter((n) => cnpjSoDigitos(entrada ? n.cnpjDestinatario : n.cnpjEmitente) === cnpjEmpresa);
  // A transação ligada, mesmo desfeita (o original a buscava só pelo id).
  const transacoes = new Map(d.transacoes.map((t) => [t.id, t]));
  const linhas = escolhidas.map((n): Linha => {
    const t = n.transacaoId ? transacoes.get(n.transacaoId) : undefined;
    return {
      data_emissao: n.dataEmissao.toISOString().slice(0, 10),
      numero: n.numero ?? "",
      serie: n.serie ?? "",
      cnpj_emitente: n.cnpjEmitente ?? "",
      nome_emitente: n.nomeEmitente ?? "",
      cnpj_destinatario: n.cnpjDestinatario ?? "",
      valor: n.valor,
      chave_acesso: n.chaveAcesso ?? "",
      status: n.status ?? "",
      data_transacao: t ? t.data : "",
      valor_transacao: t ? t.valor : "",
    };
  });
  return montado(p.tipo, COLUNAS_NOTAS, linhas, linhas.length);
}

const ZERO = dec("0.00");

/** Igualdade exata: os valores gravados têm centavos, e uma tolerância esconderia uma divergência de R$ 0,01. */
const TOLERANCIA_CONCILIACAO = dec("0.00");

function conferencia(d: DadosDaExportacao, p: PedidoDeExportacao): Montagem {
  const transacoes = transacoesDaConferencia(d, p);
  const ids = new Set(transacoes.map((t) => t.id));
  const agrupar = <T extends { transacaoId: string | null; criadoEm: Date; id: string }>(itens: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of [...itens].sort(porCriacao)) {
      if (!x.transacaoId || !ids.has(x.transacaoId)) continue;
      m.set(x.transacaoId, [...(m.get(x.transacaoId) ?? []), x]);
    }
    return m;
  };
  const notasPor = agrupar(d.notas.filter((n) => !n.apagada));
  const compsPor = agrupar(d.comprovantes.filter((c) => !c.apagado));

  const linhas: Linha[] = [];
  for (const t of transacoes) {
    const ns = notasPor.get(t.id) ?? [];
    const cs = compsPor.get(t.id) ?? [];
    const temDocumento = ns.length > 0 || cs.length > 0;
    const totalDocumentos = soma(
      ns.reduce((s, n) => soma(s, n.valor), ZERO),
      cs.reduce((s, c) => soma(s, c.valorPago), ZERO),
    );
    // Notas e comprovantes herdam a direção da transação; o residual fica assinado (positivo aumenta o saldo).
    const divergencia = subtrai(valorAssinado(totalDocumentos, t.dc), valorAssinado(t.valor, t.dc));
    const status = !temDocumento ? "Pendente" : compara(modulo(divergencia), TOLERANCIA_CONCILIACAO) <= 0 ? "Conciliado" : "Divergente";
    const vezes = Math.max(ns.length, cs.length, 1);
    for (let i = 0; i < vezes; i++) {
      const n = ns[i];
      const c = cs[i];
      const primeira = i === 0;
      linhas.push({
        data_transacao: primeira ? t.data : "",
        historico_extrato: primeira ? t.historico : "",
        dc: primeira ? t.dc : "",
        valor_transacao: primeira ? t.valor : "",
        status_transacao: primeira ? t.status : "",
        nota_numero: n ? (n.numero ?? "") : "",
        tipo_nota: n ? n.tipo : "",
        valor_nota: n ? n.valor : "",
        favorecido_comprovante: c ? (c.favorecido ?? "") : "",
        valor_pago_comprovante: c ? c.valorPago : "",
        total_documentos: primeira ? totalDocumentos : "",
        divergencia_residual: primeira ? divergencia : "",
        status_conciliacao: primeira ? status : "",
      });
    }
  }
  return montado("conferencia", COLUNAS_CONFERENCIA, linhas, linhas.length);
}

/** `exportar` sem o banco: as linhas, as colunas e a folha de cada tipo, ou a recusa. */
export function montarExportacao(d: DadosDaExportacao, p: PedidoDeExportacao, opcoes: { casaNaBusca?: Busca } = {}): Montagem {
  switch (p.tipo) {
    case "lancamentos":
      return lancamentos(d, p);
    case "lancamentos_importacao":
      return dominio(d, p);
    case "extrato":
      return extrato(d, p, opcoes.casaNaBusca ?? casaNaBusca);
    case "conferencia":
      return conferencia(d, p);
    default:
      return notas(d, p);
  }
}

/** O valor que vem do banco (`Decimal(15,2)`, que o MySQL devolve sem os zeros à direita) com as duas casas, como o PostgreSQL. */
export function duasCasas(v: Dec): Dec {
  return reescala(v, -2);
}
