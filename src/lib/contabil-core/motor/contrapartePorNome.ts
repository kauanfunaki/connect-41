// Porte de `src/domain/neo/contraparte_por_nome.py` do Contábil Core: reconhece a contraparte pelo
// nome que aparece no histórico do extrato.
//
// Nome é evidência MAIS FRACA que documento: bancos truncam, abreviam e escrevem o mesmo fornecedor
// de jeitos diferentes. Por isso o casamento por nome só é tentado sem evidência documental e é
// recusado em qualquer ambiguidade. Classificar errado custa mais do que deixar pendente: pendente
// aparece na fila, errado entra no razão em silêncio.
//
// As três guardas:
// 1. núcleo do nome: "Forcecar Automotive Ltda." vira "forcecar automotive" (sufixo societário é
//    ruído, e o extrato raramente o traz);
// 2. núcleo curto demais não vale ("ABC" casaria dentro de palavras maiores);
// 3. empate recusa: se dois cadastros casam com o mesmo histórico, nenhum é usado.

import { len, ordenados, split } from "./unicodePy";
import { normalizarParaMatch } from "./texto";

/** Sufixos societários: aparecem no cadastro e quase nunca no extrato. */
const SUFIXOS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "s", "a", "cia", "companhia",
  "mei", "ei", "eirl", "in", "filial", "matriz",
]);

/** Abaixo disto o núcleo casa por acaso. Com dois tokens já há especificidade; com um, só nome longo. */
const MIN_CARACTERES_UM_TOKEN = 8;
const MIN_CARACTERES_TOTAL = 5;

export type CandidataPorNome<Id = string> = { readonly contraparteId: Id; readonly nucleo: string };

/** 'Forcecar Automotive Ltda.' → 'forcecar automotive' */
export function nucleoDoNome(nome: string | null | undefined): string {
  if (!nome) return "";
  const tokens = split(normalizarParaMatch(nome));
  // Só tira sufixo do FIM: "Cia Brasileira de Alimentos" perderia a primeira palavra.
  while (tokens.length && SUFIXOS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/** Núcleos curtos demais casam por acaso e não devem ser usados. */
export function nucleoUtilizavel(nucleo: string): boolean {
  if (!nucleo) return false;
  if (len(nucleo.replace(/ /g, "")) < MIN_CARACTERES_TOTAL) return false;
  const tokens = split(nucleo);
  if (tokens.length === 1 && len(tokens[0]) < MIN_CARACTERES_UM_TOKEN) return false;
  return true;
}

/**
 * `{ achada }` no acerto, ou `{ motivo }` na recusa por empate. O motivo vira texto na fila: o contador
 * precisa saber que houve um quase-acerto e por que ele não foi aceito.
 */
export function casarPorNome<Id>(
  historico: string,
  candidatas: readonly CandidataPorNome<Id>[],
): { achada: CandidataPorNome<Id> | null; motivo: string | null } {
  const alvo = normalizarParaMatch(historico);
  if (!alvo) return { achada: null, motivo: null };

  const achadas = candidatas.filter((c) => nucleoUtilizavel(c.nucleo) && alvo.includes(c.nucleo));
  if (!achadas.length) return { achada: null, motivo: null };

  // Empate é entre cadastros distintos. Razão social e fantasia do MESMO cadastro não empatam.
  const ids = new Set(achadas.map((c) => c.contraparteId));
  if (ids.size > 1) {
    const nomes = ordenados(new Set(achadas.map((c) => c.nucleo))).slice(0, 3).join(", ");
    return {
      achada: null,
      motivo: `Mais de uma contraparte casa com este histórico (${nomes}). Classifique manualmente ou ajuste os cadastros.`,
    };
  }

  // Entre núcleos do mesmo cadastro, o mais longo é o mais específico (o primeiro, no empate).
  let melhor = achadas[0];
  for (const c of achadas) if (len(c.nucleo) > len(melhor.nucleo)) melhor = c;
  return { achada: melhor, motivo: null };
}
