// Relatório de situação fiscal (Sitfis) pelo Serpro — regras puras (Fase 1, 20/10/2026).
//
// Dois tempos: o Apoiar (grátis) devolve um protocolo e o tempo de espera; o
// Emitir (R$ 0,32) devolve o PDF. O cuidado é o relógio:
// - emitir ANTES do tempo de espera volta 202, e o 202 é cobrado;
// - emitir depois, com o relatório ainda em preparo, volta 204 (grátis), com
//   o novo tempo no ETag ("tempoEspera:4000");
// - pedir o protocolo de novo no mesmo dia volta 304, com o protocolo no ETag;
// - o Apoiar pode responder 200 com o aviso AV02, ou 503, sem protocolo e com
//   o tempo para tentar de novo;
// - o protocolo só vale no dia do pedido (horário de Brasília).
//
// Decisão do Kauan em 20/10/2026: o relatório sai por clique na ficha da
// empresa, e o PDF vai para a pasta Fiscal dos Arquivos.

import type { ResultadoDaChamada } from "./cliente";
import { valorDoEtag, type PedidoAoSerpro } from "./regras";
import { pedidoDoServico, servicoDoCatalogo } from "./servicos";

export const PROTOCOLO = servicoDoCatalogo("SITFIS", "SOLICITARPROTOCOLO91")!;
export const RELATORIO = servicoDoCatalogo("SITFIS", "RELATORIOSITFIS92")!;

export const pedidoDoProtocolo = (documento: string): PedidoAoSerpro => pedidoDoServico(PROTOCOLO, documento, null);
export const pedidoDoRelatorio = (documento: string, protocolo: string): PedidoAoSerpro =>
  pedidoDoServico(RELATORIO, documento, { protocoloRelatorio: protocolo });

/** A folga além do tempo que o Serpro pede: chegar cedo custa um 202. */
export const FOLGA_MS = 2000;
/** O 304 manda o protocolo, mas não quanto falta: espera o bastante para não pagar o 202. */
export const ESPERA_DO_PROTOCOLO_EM_CACHE_MS = 60_000;
/** Sem tempo nenhum na resposta: o que a documentação mostra de exemplo, com folga. */
const ESPERA_PADRAO_MS = 4000;
/** Rede, cota (429) ou tempo esgotado (504): tenta de novo no próximo ciclo. */
export const ESPERA_DE_FALHA_MS = 10 * 60_000;

export type Passo =
  /** Tem protocolo: emitir depois de esperar. */
  | { tipo: "emitir"; protocolo: string; esperaMs: number }
  /** O Serpro pediu para pedir o protocolo de novo mais tarde. */
  | { tipo: "pedir_de_novo"; esperaMs: number }
  /** Ainda em preparo: emitir de novo depois de esperar. `cobrado` = foi um 202. */
  | { tipo: "aguardar"; esperaMs: number; cobrado: boolean }
  | { tipo: "pronto"; pdf: string }
  /** `tentarDeNovo`: passa sozinho (rede, 429, 504, 5xx do Serpro). */
  | { tipo: "erro"; erro: string; tentarDeNovo: boolean };

type Objeto = Record<string, unknown>;
const dadosDe = (r: ResultadoDaChamada): Objeto | null => {
  const d = r.resposta?.dados;
  return d && typeof d === "object" && !Array.isArray(d) ? (d as Objeto) : null;
};
const esperaDe = (v: unknown, padrao = ESPERA_PADRAO_MS) => (Number(v) > 0 ? Number(v) : padrao) + FOLGA_MS;

function falha(r: Extract<ResultadoDaChamada, { ok: false }>): Passo {
  const passa = r.motivo === "rede" || r.status === 429 || r.status === 504 || (r.status !== null && r.status >= 500);
  return { tipo: "erro", erro: r.erro, tentarDeNovo: passa };
}

/** O que fazer depois do Apoiar. */
export function passoDoProtocolo(r: ResultadoDaChamada): Passo {
  if (!r.ok) {
    // 503 com tempo de espera: o Serpro está cheio; o pedido continua de pé.
    const tempo = dadosDe(r)?.tempoEspera;
    if (r.status === 503 && Number(tempo) > 0) return { tipo: "pedir_de_novo", esperaMs: esperaDe(tempo) };
    return falha(r);
  }
  if (r.resposta.status === 304) {
    const protocolo = valorDoEtag(r.cabecalhos.etag, "protocoloRelatorio");
    return protocolo
      ? { tipo: "emitir", protocolo, esperaMs: ESPERA_DO_PROTOCOLO_EM_CACHE_MS }
      : { tipo: "erro", erro: "O Serpro disse que o protocolo de hoje está em cache, mas não o mandou.", tentarDeNovo: false };
  }
  const d = dadosDe(r);
  const protocolo = typeof d?.protocoloRelatorio === "string" ? d.protocoloRelatorio : null;
  if (protocolo) return { tipo: "emitir", protocolo, esperaMs: esperaDe(d?.tempoEspera) };
  // AV02: o limite de pedidos em preparo foi atingido; tenta de novo depois do tempo.
  if (Number(d?.tempoEspera) > 0) return { tipo: "pedir_de_novo", esperaMs: esperaDe(d?.tempoEspera) };
  return { tipo: "erro", erro: "O Serpro não devolveu o protocolo do relatório.", tentarDeNovo: false };
}

/** O que fazer depois do Emitir. */
export function passoDoRelatorio(r: ResultadoDaChamada): Passo {
  if (!r.ok) return falha(r);
  const status = r.resposta.status;
  if (status === 204) return { tipo: "aguardar", esperaMs: (r.tempoEsperaMs ?? ESPERA_PADRAO_MS) + FOLGA_MS, cobrado: false };
  if (status === 202) return { tipo: "aguardar", esperaMs: esperaDe(dadosDe(r)?.tempoEspera), cobrado: true };
  const pdf = dadosDe(r)?.pdf;
  if (typeof pdf === "string" && pdf.length > 0) return { tipo: "pronto", pdf };
  return { tipo: "erro", erro: "O Serpro não devolveu o PDF do relatório.", tentarDeNovo: false };
}

/** O nome do arquivo nos Arquivos: "Situação fiscal - Empresa - 2026-10-20.pdf". */
export function nomeDoRelatorio(empresa: string, dia: string): string {
  const limpo = empresa.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
  return `Situação fiscal - ${limpo} - ${dia}.pdf`;
}
