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

/** Os `integrationCode` que são conexão de WhatsApp. */
export const CODIGOS_DE_WHATSAPP: string[] = REGISTRO.map((p) => p.codigo);

export function provedorDaIntegracao(codigo: string): ProvedorWhatsapp | null {
  return REGISTRO.find((p) => p.codigo === codigo) ?? null;
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
