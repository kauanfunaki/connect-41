// O link de um teste enviado, enquanto o candidato não responde (14/10/2026,
// escolha "Teste · 1A — Link com botões e prazo" do Kauan): o prazo contando e
// a mensagem pronta para o WhatsApp. Regras puras — a tela só desenha.
//
// Só o que o Connect guarda do link: quando foi gerado, por quem e até quando
// vale (7 dias). Não guarda se o e-mail saiu nem se o candidato abriu.

import { hojeIso } from "@/lib/datas/calendario";
import { normalizePhoneBR } from "@/lib/chatwoot/linking";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias de calendário entre dois "AAAA-MM-DD" (b − a). */
function diasEntre(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DIA_MS);
}

export type PrazoDoLink = {
  /** O link já não abre: o candidato vê "link expirado". */
  vencido: boolean;
  /**
   * Dias de calendário até o vencimento, em São Paulo: gerado no dia 13 e
   * vencendo no 20, no dia 14 faltam 6. Zero é "vence hoje". Contar em horas
   * daria "1 dia" a um link que vence hoje de manhã.
   */
  diasRestantes: number;
  /** Quanto do prazo já passou, de 0 a 1 — a barra. */
  usado: number;
};

export function prazoDoLink({ criadoEm, expiraEm, agora }: { criadoEm: Date; expiraEm: Date; agora: Date }): PrazoDoLink {
  const vencido = agora.getTime() >= expiraEm.getTime();
  const total = expiraEm.getTime() - criadoEm.getTime();
  const usado = total > 0 ? Math.min(1, Math.max(0, (agora.getTime() - criadoEm.getTime()) / total)) : 1;
  return {
    vencido,
    diasRestantes: vencido ? 0 : Math.max(0, diasEntre(hojeIso(agora), hojeIso(expiraEm))),
    usado: vencido ? 1 : usado,
  };
}

/**
 * A frase do prazo em duas partes — a tela põe a segunda em negrito:
 * "Expira em **6 dias**", "Expira **amanhã**", "Expira **hoje**", "**Venceu**".
 */
export function partesDoPrazo(p: PrazoDoLink): { texto: string; destaque: string } {
  if (p.vencido) return { texto: "", destaque: "Venceu" };
  if (p.diasRestantes === 0) return { texto: "Expira", destaque: "hoje" };
  if (p.diasRestantes === 1) return { texto: "Expira", destaque: "amanhã" };
  return { texto: "Expira em", destaque: `${p.diasRestantes} dias` };
}

/** "Expira em 6 dias", "Expira amanhã", "Expira hoje", "Venceu". */
export function fraseDoPrazo(p: PrazoDoLink): string {
  const { texto, destaque } = partesDoPrazo(p);
  return texto ? `${texto} ${destaque}` : destaque;
}

/** O primeiro nome, para a mensagem não começar com "Olá, Gabriel Santos da Silva!". */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/**
 * A mensagem curta para o candidato: a vaga (quando o teste é de uma
 * candidatura), o link e até quando ele vale.
 */
export function mensagemDoTeste({
  nome,
  vaga,
  url,
  validoAte,
}: {
  nome: string;
  vaga: string | null;
  url: string;
  /** "20/10" — o dia em que o link deixa de abrir. */
  validoAte: string;
}): string {
  const ola = primeiroNome(nome) ? `Olá, ${primeiroNome(nome)}!` : "Olá!";
  const pedido = vaga
    ? `Para seguir no processo da vaga ${vaga}, responda este teste rápido pelo link:`
    : "Responda este teste rápido pelo link:";
  return `${ola} ${pedido}\n${url}\n\nO link vale até ${validoAte}. Qualquer dúvida, é só responder aqui.`;
}

/**
 * O endereço do WhatsApp com a mensagem pronta. Com o telefone do candidato
 * (brasileiro, com DDD), abre a conversa com ele; sem telefone que sirva,
 * abre o WhatsApp para a pessoa escolher o contato.
 */
export function linkDoWhatsApp(telefone: string | null | undefined, mensagem: string): string {
  const numero = normalizePhoneBR(telefone)?.replace(/\D/g, "") ?? "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}
