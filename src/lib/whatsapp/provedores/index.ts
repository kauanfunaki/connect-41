// Os provedores de WhatsApp que o Connect sabe operar, por código de integração.
//
// Mesma forma do `MODULE_CATALOG` e do `INTEGRATION_CATALOG`: provedor novo é
// um arquivo em `provedores/` e uma linha aqui — o atendimento, as telas e as
// tabelas não mudam.

import { JANELA_LIVRE_EM_HORAS } from "../decisao";
import { provedorMeta } from "./meta";
import { provedorEvolucao } from "./evolucao";
import type { ProvedorWhatsapp } from "./tipos";

const REGISTRO: ProvedorWhatsapp[] = [provedorMeta, provedorEvolucao];

/**
 * O número do escritório, no Atendimento (10/11/2026): os mesmos provedores,
 * com outro código. O código é o que separa as duas caixas — o webhook desvia
 * por ele, e nada do atendimento de candidato roda para estes números.
 */
const REGISTRO_DO_ATENDIMENTO: ProvedorWhatsapp[] = [
  { ...provedorMeta, codigo: "whatsapp_atendimento" },
  { ...provedorEvolucao, codigo: "whatsapp_atendimento_evolution" },
];

/** Os `integrationCode` que são conexão de WhatsApp do Recrutamento. */
export const CODIGOS_DE_WHATSAPP: string[] = REGISTRO.map((p) => p.codigo);

/** Os `integrationCode` do número do escritório, no Atendimento. */
export const CODIGOS_DO_ATENDIMENTO: string[] = REGISTRO_DO_ATENDIMENTO.map((p) => p.codigo);

/** Todo código que recebe webhook de WhatsApp: os dois atendimentos. */
export const CODIGOS_COM_WEBHOOK: string[] = [...CODIGOS_DE_WHATSAPP, ...CODIGOS_DO_ATENDIMENTO];

export function ehDoAtendimento(codigo: string): boolean {
  return CODIGOS_DO_ATENDIMENTO.includes(codigo);
}

export function provedorDaIntegracao(codigo: string): ProvedorWhatsapp | null {
  return REGISTRO.find((p) => p.codigo === codigo) ?? REGISTRO_DO_ATENDIMENTO.find((p) => p.codigo === codigo) ?? null;
}

/**
 * A janela de mensagem livre de uma conexão, pelo código dela.
 *
 * Código desconhecido fica com a janela **mais restritiva** (a da Meta), e não
 * com "sem janela": errar para o lado de recusar uma resposta é a pessoa ver o
 * motivo na tela; errar para o outro é mandar mensagem que o provedor recusa ou
 * que a política não permite.
 */
export function janelaDoCodigo(codigo: string): number | null {
  const provedor = provedorDaIntegracao(codigo);
  return provedor ? provedor.politica.janelaLivreHoras : JANELA_LIVRE_EM_HORAS;
}
