// A caixa de conversas (lista em cartões + painel do contato) — regras puras.
//
// Pedido do Kauan (09/10/2026): os chats do Connect — atendimento do
// Recrutamento, Conversas da Controladoria, conversa com o cliente do BPO —
// com uma interface só, inspirada no print que ele mandou: cartões à esquerda
// com iniciais, nome, selo, hora e uma linha de contexto; o painel à direita
// com navegação entre conversas, ações rápidas, dados e abas.

import { hojeIso, somarDias } from "@/lib/datas/calendario";
import { formatInstantTime } from "@/lib/format";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/**
 * A hora do cartão, curta como num app de mensagem: "08:23" hoje, "Ontem",
 * "10 set" no mesmo ano, "10/09/2025" antes. Tudo no dia de São Paulo.
 */
export function quandoCurto(data: Date | null, agora: Date): string {
  if (!data) return "";
  const dia = hojeIso(data);
  const hoje = hojeIso(agora);
  if (dia === hoje) return formatInstantTime(data, { hour: "2-digit", minute: "2-digit" });
  if (dia === somarDias(hoje, -1)) return "Ontem";
  const [ano, mes, d] = dia.split("-");
  if (ano === hoje.slice(0, 4)) return `${Number(d)} ${MESES_CURTOS[Number(mes) - 1]}`;
  return `${d}/${mes}/${ano}`;
}

/** Duas letras para o quadradinho do cartão: "Fabrice Edouard" → "FE". Sem nome (ou só o telefone), "#". */
export function iniciais(nome: string | null | undefined): string {
  if (!/\p{L}/u.test(nome ?? "")) return "#";
  const partes = (nome ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "#";
  const primeira = partes[0][0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : (partes[0][1] ?? "");
  return (primeira + ultima).toUpperCase();
}

/** A anterior e a próxima de uma lista, para o ↑↓ do painel. */
export function vizinhas<T extends { id: string }>(lista: T[], id: string): { anterior: T | null; proxima: T | null; posicao: number } {
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) return { anterior: null, proxima: null, posicao: -1 };
  return { anterior: lista[i - 1] ?? null, proxima: lista[i + 1] ?? null, posicao: i };
}
