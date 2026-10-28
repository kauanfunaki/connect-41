// O protocolo parado no órgão (lote 5, 28/10/2026). Pedido da LISA: depois da
// taxa paga, o órgão não atualiza o status, e o setor só lembra de cobrar
// quando o cliente pergunta. O protocolo que aguarda o órgão há N dias sem
// resposta avisa o responsável do processo para cobrar — e de novo a cada N
// dias, enquanto seguir parado.
//
// N é do escritório (Societário › Prazos); sem escolha, vale o padrão, até o
// setor dizer o dele. Este arquivo é só regra, sem banco: a tela (componente
// do navegador) importa daqui. A leitura do prazo gravado está em
// ./protocoloParadoServidor.ts.

/** O padrão até o setor dizer o dele. */
export const COBRAR_APOS_DIAS_PADRAO = 15;

/** As opções da tela; 0 = não avisa. */
export const OPCOES_DA_COBRANCA = [7, 10, 15, 20, 30, 45, 0] as const;

export function rotuloDaCobranca(dias: number): string {
  return dias === 0 ? "Não avisar" : `${dias} dias sem resposta`;
}

/** O valor da tela, conferido: um dos de OPCOES_DA_COBRANCA, ou null. */
export function lerDiasDaCobranca(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,3}$/.test(v.trim()) ? Number(v) : NaN;
  return (OPCOES_DA_COBRANCA as readonly number[]).includes(n) ? n : null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Há quantos dias o protocolo espera, e em que volta do aviso está: a 1ª aos
 * N dias, a 2ª aos 2N… `null` = ainda não é hora (ou o aviso está desligado).
 * A volta entra na chave do aviso, e por isso cada uma sai uma vez só.
 */
export function protocoloParado(protocoladoEm: Date, agora: Date, dias: number): { diasParado: number; volta: number } | null {
  if (dias <= 0) return null;
  const diasParado = Math.floor((agora.getTime() - protocoladoEm.getTime()) / DIA_MS);
  if (diasParado < dias) return null;
  return { diasParado, volta: Math.floor(diasParado / dias) };
}

export const chaveDoProtocoloParado = (protocoloId: string, volta: number) => `protocolo-parado:${protocoloId}:${volta}`;

export function mensagemDoProtocoloParado(p: { orgao: string; empresa: string; processo: string; diasParado: number }): string {
  return `Protocolo sem resposta há ${p.diasParado} dias em ${p.orgao}: ${p.empresa} — ${p.processo}. Hora de cobrar o órgão.`.slice(0, 250);
}
