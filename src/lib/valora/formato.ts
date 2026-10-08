// Os formatos do Valora são os do app (07/10/2026): a base levou para
// lib/format.ts os que nasceram aqui, e o DP passou a usá-los de lá. Os nomes
// curtos ficam para as telas do Valora, que os usam em toda linha.
import { formatarHoras, formatarNumero, formatarReais } from "@/lib/format";

/** Reais; null (preço impossível) vira travessão. */
export const brl = formatarReais;

/** Número em pt-BR com até `casas` decimais (0 a 2). */
export const num = formatarNumero;

export const horas = formatarHoras;
