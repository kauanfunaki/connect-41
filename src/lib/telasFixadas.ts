// Telas fixadas na sidebar — as regras, puras.
//
// Fixar é atalho pessoal: não dá acesso a nada. Quem decide o que a pessoa
// enxerga continua sendo o módulo estar ligado no tenant e ela poder ver o setor
// — por isso a lista guardada é filtrada **na leitura** (`telasFixadasVisiveis`)
// em vez de limpa na escrita. Módulo desligado hoje e religado amanhã volta a
// aparecer fixado, que é o que a pessoa esperaria.

import { getModuleDef } from "@/lib/module-catalog";

/**
 * Teto de telas fixadas.
 *
 * Seis é o que cabe na sidebar acima do "Geral" sem empurrar o resto para
 * baixo da dobra. Sem teto, "fixar" vira uma segunda lista de tudo — que é
 * exatamente o problema que a fixação existe para resolver.
 */
export const LIMITE_DE_TELAS_FIXADAS = 6;

export type VereditoDeFixar = { ok: true; fixar: boolean } | { ok: false; erro: string };

/**
 * O clique no alfinete fixa ou solta? E, quando não pode, por quê.
 *
 * Código fora do catálogo é recusado em vez de gravado: a lista guardada é de
 * módulo, e o que não existe não teria como ser desenhado depois.
 */
export function avaliarFixar(
  atuais: string[],
  code: string,
  limite: number = LIMITE_DE_TELAS_FIXADAS
): VereditoDeFixar {
  if (!getModuleDef(code)) return { ok: false, erro: "Tela desconhecida." };
  if (atuais.includes(code)) return { ok: true, fixar: false };
  if (atuais.length >= limite) {
    return { ok: false, erro: `Você já tem ${limite} telas fixadas. Solte uma antes de fixar outra.` };
  }
  return { ok: true, fixar: true };
}

/**
 * As fixadas que a sidebar mostra: na ordem escolhida, e só o que a pessoa pode
 * abrir agora.
 *
 * `disponiveis` são as telas ligadas no tenant que ela enxerga. Fixada que saiu
 * dessa lista (módulo desligado, transferido para outro setor, tirado do
 * catálogo) simplesmente não aparece — e continua guardada.
 */
export function telasFixadasVisiveis<T extends { code: string }>(codigos: string[], disponiveis: T[]): T[] {
  const porCodigo = new Map(disponiveis.map((d) => [d.code, d]));
  const vistos = new Set<string>();
  const telas: T[] = [];
  for (const code of codigos) {
    const tela = porCodigo.get(code);
    if (!tela || vistos.has(code)) continue;
    vistos.add(code);
    telas.push(tela);
  }
  return telas;
}
