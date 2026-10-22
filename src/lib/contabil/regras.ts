import { z } from "zod";
import { TIPOS_CONTABEIS, type ContextoContabil, type PendenciaContabil, type SecaoContabil } from "./types";

export const contextoSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/, "Escolha um estabelecimento válido."),
  periodo: z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "Escolha a competência ou o ano."),
  tipos: z.array(z.enum(["entradas", "apoio", "saidas"])).min(1).max(3).transform(t => [...new Set(t)]),
  incluir_dominio: z.boolean(),
}).refine(c => c.periodo.length === 7 || !c.tipos.includes("saidas"), { message: "O faturamento é consultado por competência. Escolha um mês." });

export function mesmoContexto(a: ContextoContabil, b: ContextoContabil) {
  return a.cnpj === b.cnpj && a.periodo === b.periodo && a.incluir_dominio === b.incluir_dominio && [...a.tipos].sort().join() === [...b.tipos].sort().join();
}
export function pendenciasAgrupadas(secoes: SecaoContabil[]): PendenciaContabil[] {
  const mapa = new Map<string, PendenciaContabil>();
  for (const s of secoes) for (const p of s.pendencias) {
    const anterior = mapa.get(p.id);
    if (!anterior) mapa.set(p.id, { ...p, competencias: [...p.competencias] });
    else {
      anterior.qtd += p.qtd;
      // Totais de exibição somados em centavos, sem alterar os cálculos do motor.
      anterior.valor = somarValores([anterior.valor, p.valor]);
      anterior.competencias = [...new Set([...anterior.competencias, ...p.competencias])];
    }
  }
  return [...mapa.values()];
}
export function contextoDaUrl(params: URLSearchParams, padrao: ContextoContabil): ContextoContabil {
  const tentativa = contextoSchema.safeParse({ cnpj: params.get("cnpj") ?? padrao.cnpj, periodo: params.get("periodo") ?? padrao.periodo,
    tipos: params.get("tipos")?.split(",") ?? padrao.tipos, incluir_dominio: params.get("somente_faltantes") !== "1" });
  return tentativa.success ? tentativa.data : padrao;
}
export function etapaDaUrl(params: URLSearchParams) { const n = Number(params.get("etapa") ?? 1); return n >= 1 && n <= 4 && Number.isInteger(n) ? n : 1; }
export function rotuloTipo(tipo: string) { return TIPOS_CONTABEIS[tipo as keyof typeof TIPOS_CONTABEIS] ?? tipo; }

/** Contrato monetário: string decimal com duas casas, proveniente do Python. */
export function somarValores(valores: string[]): string {
  const total = valores.reduce((soma, valor) => {
    const m = /^(-?)([0-9]+)(?:[.]([0-9]{1,2}))?$/.exec(valor);
    if (!m) throw new Error("Valor monetário inválido no relatório.");
    const centavos = BigInt(m[2]) * BigInt(100) + BigInt((m[3] ?? "").padEnd(2, "0"));
    return soma + (m[1] ? -centavos : centavos);
  }, BigInt(0));
  const absoluto = total < BigInt(0) ? -total : total;
  return (total < BigInt(0) ? "-" : "") + String(absoluto / BigInt(100)) + "." + String(absoluto % BigInt(100)).padStart(2, "0");
}

/** Formatos que todos os tipos selecionados conseguem produzir no motor atual. */
export function formatosDoContexto(contexto: ContextoContabil): string[] {
  const csv = !contexto.tipos.includes("saidas") && (contexto.periodo.length === 7 || !contexto.tipos.includes("entradas"));
  return csv ? ["xlsx", "txt", "csv"] : ["xlsx", "txt"];
}
