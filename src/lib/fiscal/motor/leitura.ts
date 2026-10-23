// Leitura do motor sem derrubar a página (22/10/2026; 23/10 com o estado do erro).
//
// Separado de `tela.ts` para que os carregadores das telas (`./telas/*`) não
// dependam de sessão nem de banco e possam ser testados com `fetch` simulado.

import { ErroDoMotor } from "@/lib/sped/motor";

/** A falha de uma leitura, com o que a tela precisa para decidir o estado: ocupado, 422, fora do ar. */
export type FalhaDaLeitura = { dados: null; erro: string; codigo: string | null; status: number; retryAfter: number | null };
export type Leitura<T> = { dados: T; erro: null } | FalhaDaLeitura;

/** Lê do motor e devolve o erro em português no lugar de derrubar a página. */
export async function doMotor<T>(leitura: () => Promise<T>): Promise<Leitura<T>> {
  try {
    return { dados: await leitura(), erro: null };
  } catch (err) {
    if (err instanceof ErroDoMotor) return { dados: null, erro: err.message, codigo: err.codigo, status: err.status, retryAfter: err.retryAfter };
    console.error("[fiscal/motor]", err);
    return { dados: null, erro: "Falha inesperada ao ler o motor SPED.", codigo: null, status: 0, retryAfter: null };
  }
}
