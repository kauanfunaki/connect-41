import type { assess } from "@/lib/tributario/avaliacao/assessment";
import type { Study } from "@/lib/tributario/avaliacao/model";
import type { Data } from "@/lib/tributario/motor/fiscal";

/** O que `assess()` devolve: campos resolvidos, os quatro cartões, o `Data` do motor. */
export type ResultadoDaAvaliacao = ReturnType<typeof assess>;

export type Secao = "dados" | "premissas" | "resultado" | "relatorio" | "historico";
export type AbaDasPremissas = "tributacao" | "folha" | "atividades";
export type IrPara = (secao: Secao, aba?: AbaDasPremissas) => void;

/** As três formas de mexer na avaliação, iguais às do original (`patch`, `fieldPatch`, `basePatch`). */
export type Edicao = {
  patch: (p: Partial<Study>) => void;
  campo: (chave: string, valor: number | null) => void;
  base: (p: Partial<Data>) => void;
};
