// Carregar o plano padrão da 41 no plano do escritório.
//
// Não sobrescreve decisão de ninguém: categoria que o escritório já tem (mesmo
// nome e lado) só ganha o grupo do plano e a linha da DRE **se estiverem
// vazios**. Categoria nova entra com os dois. Categoria do escritório que não
// está no padrão fica como está — sair do padrão é decisão, não limpeza.

import { chaveDaCategoria } from "@/lib/dre/calculo";
import type { FinanceEntryKind } from "@/generated/prisma/enums";
import type { CategoriaDoPlanoPadrao } from "./planoPadrao";

export type CategoriaExistente = {
  id: string;
  name: string;
  kind: FinanceEntryKind;
  planGroup: string | null;
  dreGroup: string | null;
};

export type PlanoDaCarga = {
  criar: CategoriaDoPlanoPadrao[];
  completar: { id: string; planGroup?: string; dreGroup?: string }[];
  jaCompletas: number;
};

export function planejarCarga(existentes: CategoriaExistente[], padrao: CategoriaDoPlanoPadrao[]): PlanoDaCarga {
  const porChave = new Map(existentes.map((e) => [`${e.kind}|${chaveDaCategoria(e.name)}`, e]));
  const plano: PlanoDaCarga = { criar: [], completar: [], jaCompletas: 0 };
  const vistas = new Set<string>();

  for (const p of padrao) {
    const chave = `${p.kind}|${chaveDaCategoria(p.nome)}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    const atual = porChave.get(chave);
    if (!atual) {
      plano.criar.push(p);
      continue;
    }
    const mudanca: { id: string; planGroup?: string; dreGroup?: string } = { id: atual.id };
    if (!atual.planGroup && p.grupo) mudanca.planGroup = p.grupo;
    if (!atual.dreGroup && p.dre) mudanca.dreGroup = p.dre;
    if (mudanca.planGroup || mudanca.dreGroup) plano.completar.push(mudanca);
    else plano.jaCompletas++;
  }
  return plano;
}
