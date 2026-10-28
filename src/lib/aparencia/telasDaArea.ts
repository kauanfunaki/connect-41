// A página de cada área de uso (28/10/2026, opção 1 da página "Cores do
// Connect da equipe", como a página de área do Omie): todas as telas da área
// que a pessoa abre, de qualquer setor, em cartões. Chega-se nela pela
// etiqueta da área no cabeçalho.
//
// Cálculo puro: a página lê os módulos e o acesso, e isto separa e ordena.

import { MODULE_ROUTES } from "@/lib/module-catalog";
import type { GrupoDeCor } from "./cores";
import { areaDoModulo } from "./gruposDaEquipe";

/** As telas do Geral: abrem para todos, pelo endereço delas, sem passar por um setor. */
const TELAS_DO_GERAL: ReadonlySet<string> = new Set(["portal_solicitacoes", "arquivos", "helpdesk"]);

export type ModuloParaArea = { code: string; label: string; description: string; enabled: boolean; sectorCodes: readonly string[] };
export type TelaDaArea = { code: string; label: string; description: string; href: string };
/** `setor` nulo é o bloco Geral. */
export type BlocoDaArea = { setor: string | null; telas: TelaDaArea[] };

/**
 * As telas ligadas da área, por setor, só dos setores que a pessoa vê. O Geral
 * vem primeiro; os setores, na ordem em que aparecem no catálogo. A tela de
 * vários setores entra uma vez, no primeiro que a pessoa vê.
 */
export function telasDaArea(area: GrupoDeCor, modulos: readonly ModuloParaArea[], podeVer: (setor: string) => boolean): BlocoDaArea[] {
  const blocos = new Map<string | null, TelaDaArea[]>();
  for (const m of modulos) {
    if (!m.enabled || areaDoModulo(m.code) !== area) continue;
    const doGeral = TELAS_DO_GERAL.has(m.code);
    const setor = doGeral ? null : m.sectorCodes.find(podeVer);
    if (setor === undefined) continue;
    const href = doGeral ? MODULE_ROUTES[m.code] : `/setor/${setor}/${m.code}`;
    if (!href) continue;
    const lista = blocos.get(setor) ?? [];
    lista.push({ code: m.code, label: m.label, description: m.description, href });
    blocos.set(setor, lista);
  }
  return [...blocos.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : 0))
    .map(([setor, telas]) => ({ setor, telas }));
}
