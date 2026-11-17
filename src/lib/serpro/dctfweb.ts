// A DCTFWeb do mês pelo Serpro (17/11/2026, funcionalidade-734) — regras puras.
//
// Pedido do Victor: o recibo e o DARF da DCTFWeb de cada empresa marcada,
// baixados sozinhos todo mês. O robô pelo e-CAC foi barrado; o caminho é o
// Integra Contador, com a procuração (código 00103) de cada cliente.
//
// Por empresa e competência, a ordem é: o recibo (CONSRECIBO32, consulta,
// R$ 0,24 na faixa 1) e, havendo declaração, o DARF (GERARGUIA31, emissão,
// R$ 0,32 na faixa 1) com todos os débitos, como o portal faz por padrão — nas
// empresas com retenção, folha e fiscal vêm na mesma guia (decisão do DP,
// Wellington, 17/11/2026). Sem declaração, o recibo volta 404 (MG08), que o
// Serpro não cobra, e o DARF nem é pedido.
//
// O que já foi baixado não é pedido de novo. Sem declaração, a rotina só tenta
// de novo quando o evento E0301 (DCTFWeb recebeu declaração) é do dia da
// última tentativa ou depois, ou uma vez no "dia sem evento" (o prazo é o dia
// 15), para quando os eventos não chegam.
//
// Fontes (lidas em 17/11/2026): "Consultar Recibo Transmissão" e "Gerar
// Documento de Arrecadação" da DCTFWeb e a página "Mensagens" da DCTFWeb, na
// documentação do Integra Contador.

import { GUIA_DA_DCTFWEB, lerGuiaDaDctfweb, pedidoDoServico, RECIBO_DA_DCTFWEB, type Leitura } from "./servicos";
import type { Mensagem, PedidoAoSerpro, RespostaLida } from "./regras";
import type { PedidoDeGuia } from "./guias";

export const SITUACOES_DA_DCTFWEB = ["PENDENTE", "BAIXADO", "SEM_DECLARACAO", "SEM_DEBITO", "SEM_PROCURACAO", "ERRO"] as const;
export type SituacaoDaDctfweb = (typeof SITUACOES_DA_DCTFWEB)[number];

export const ROTULO_DA_SITUACAO_DCTFWEB: Record<SituacaoDaDctfweb, string> = {
  PENDENTE: "Na fila",
  BAIXADO: "Baixado",
  SEM_DECLARACAO: "Sem declaração transmitida",
  SEM_DEBITO: "Recibo baixado, sem débito",
  SEM_PROCURACAO: "Sem procuração",
  ERRO: "Erro",
};

/** Resolvidas: a rotina não volta a elas, nem por clique. */
export const SITUACOES_RESOLVIDAS: readonly SituacaoDaDctfweb[] = ["BAIXADO", "SEM_DEBITO"];

/** Até quantas vezes a rotina tenta sozinha uma empresa que deu erro. */
export const TENTATIVAS_MAXIMAS = 5;
/** O dia padrão a partir do qual a rotina tenta sem o evento (o prazo da DCTFWeb é o dia 15). */
export const DIA_SEM_EVENTO_PADRAO = 16;

// ─── Datas ───────────────────────────────────────────────────────────────────

const ehMes = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** A competência que a rotina busca: a do mês passado (a DCTFWeb de outubro é transmitida em novembro). */
export const competenciaDaRotina = (hoje: string) => mesAnterior(hoje.slice(0, 7));

/** A competência pedida pela tela: AAAA-MM, de um mês que já acabou. */
export function lerCompetencia(bruto: unknown, hoje: string): string | null {
  const v = typeof bruto === "string" ? bruto.trim() : "";
  return ehMes(v) && v < hoje.slice(0, 7) ? v : null;
}

export function lerDiaSemEvento(bruto: unknown): number | null {
  const n = Number(typeof bruto === "string" ? bruto.trim() : bruto);
  return Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
}

// ─── O pedido ────────────────────────────────────────────────────────────────

/** O DARF da DCTFWeb como as guias da ficha pedem: mensal, sem data de pagamento (vale hoje). */
export const guiaDaCompetencia = (competencia: string): Extract<PedidoDeGuia, { tipo: "DCTFWEB" }> => ({
  tipo: "DCTFWEB",
  periodo: competencia,
  decimoTerceiro: false,
  pagamento: null,
});

/** O recibo da declaração mais recente da competência (sem `numeroReciboEntrega`). */
export function pedidoDoRecibo(competencia: string, cnpj: string): PedidoAoSerpro {
  return pedidoDoServico(RECIBO_DA_DCTFWEB, cnpj, { categoria: "GERAL_MENSAL", anoPA: competencia.slice(0, 4), mesPA: competencia.slice(5, 7) });
}

export { GUIA_DA_DCTFWEB, RECIBO_DA_DCTFWEB };

/** O recibo vem como a guia: só o PDF, em `PDFByteArrayBase64`. */
export function lerReciboDaDctfweb(r: RespostaLida): Leitura<{ pdf: string }> {
  const l = lerGuiaDaDctfweb(r);
  if (l.ok) return l;
  return { ok: false, erro: l.erro.replace("da guia da DCTFWeb", "do recibo da DCTFWeb") };
}

// ─── As recusas da DCTFWeb ───────────────────────────────────────────────────

export type Recusa = "sem_declaracao" | "sem_debito" | "esperar" | "erro";

/** MG08 não achou declaração; MG10 a mais recente está em andamento; RELAT00 sem declaração ativa; GUIA01 declaração não ativa. */
const SEM_DECLARACAO = /\b(MG08|MG10|RELAT00|APIGUIA01|GUIA01|TRANS12)\b/;
/** GUIA02 saldo abaixo do mínimo; GUIA03 e GUIA16 sem saldo a pagar. */
const SEM_DEBITO = /\b(GUIA02|GUIA03|GUIA16)\b/;
/** GUIA00: a Selic do mês seguinte ainda não saiu; outro dia dá. */
const ESPERAR = /\bGUIA00\b/;

/** O que a recusa do Serpro quer dizer para a rotina, pelos códigos (e pelo texto, se o código vier diferente). */
export function recusaDaDctfweb(mensagens: Mensagem[]): Recusa {
  const codigos = mensagens.map((m) => m.codigo).join(" ");
  const textos = mensagens.map((m) => m.texto).join(" ").toLowerCase();
  if (SEM_DEBITO.test(codigos) || /n[ãa]o h[áa] d[ée]bitos?|n[ãa]o possui\(em\) d[ée]bitos|saldo a pagar [ée] inferior/.test(textos)) return "sem_debito";
  if (SEM_DECLARACAO.test(codigos) || /n[ãa]o foi encontrada declara|declara[çc][õo]es n[ãa]o ativas|em andamento/.test(textos)) return "sem_declaracao";
  if (ESPERAR.test(codigos) || /taxa selic/.test(textos)) return "esperar";
  return "erro";
}

// ─── Quando a rotina tenta ───────────────────────────────────────────────────

export type LinhaDaDctfweb = {
  situacao: SituacaoDaDctfweb;
  tentativas: number;
  /** AAAA-MM-DD (São Paulo) da última tentativa. */
  ultimaTentativa: string | null;
  proximaTentativa: Date | null;
};

export type Momento = {
  agora: Date;
  /** AAAA-MM-DD de São Paulo. */
  hoje: string;
  competencia: string;
  /** A rotina automática está ligada (sem ela, só o que uma pessoa pôs na fila). */
  ligada: boolean;
  diaSemEvento: number;
  /** AAAA-MM-DD do último E0301 da raiz do CNPJ; nulo = nenhum (ou os eventos não chegaram). */
  ultimoEvento: string | null;
};

/**
 * A rotina mexe nesta empresa agora? Nunca no que está resolvido; a fila de
 * quem clicou vale mesmo com a rotina desligada; o resto, só ligada e depois
 * que a competência acabou — com o evento da DCTFWeb ou a partir do dia sem evento.
 */
export function deveTentar(linha: LinhaDaDctfweb | null, m: Momento): boolean {
  if (linha && SITUACOES_RESOLVIDAS.includes(linha.situacao)) return false;
  const fila = linha?.proximaTentativa ? linha.proximaTentativa.getTime() <= m.agora.getTime() : false;
  if (linha && linha.situacao !== "SEM_DECLARACAO") {
    return fila && linha.tentativas < TENTATIVAS_MAXIMAS;
  }
  if (fila) return true;
  if (!m.ligada) return false;

  const inicio = `${mesSeguinte(m.competencia)}-01`;
  if (m.hoje < inicio) return false;
  const diaSemEvento = `${mesSeguinte(m.competencia)}-${String(m.diaSemEvento).padStart(2, "0")}`;
  const eventoDepoisDaCompetencia = !!m.ultimoEvento && m.ultimoEvento >= inicio;

  if (!linha) return eventoDepoisDaCompetencia || m.hoje >= diaSemEvento;

  // Sem declaração na última tentativa: só com sinal novo, e nunca duas vezes no mesmo dia.
  const ultima = linha.ultimaTentativa;
  if (!ultima || ultima >= m.hoje) return false;
  if (eventoDepoisDaCompetencia && m.ultimoEvento! >= ultima) return true;
  return ultima < diaSemEvento && m.hoje >= diaSemEvento;
}

// ─── Custo ───────────────────────────────────────────────────────────────────

/** "Recibo DCTFWeb - Empresa - 10-2026.pdf". */
export function nomeDoRecibo(empresa: string, competencia: string): string {
  const limpo = empresa.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `Recibo DCTFWeb - ${limpo} - ${competencia.slice(5, 7)}-${competencia.slice(0, 4)}.pdf`;
}

/** O custo estimado das chamadas cobradas de uma linha, pelo preço da faixa do mês. */
export function custoDaLinha(l: { consultasCobradas: number; emissoesCobradas: number }, preco: { consulta: number; emissao: number }): number {
  return l.consultasCobradas * preco.consulta + l.emissoesCobradas * preco.emissao;
}
