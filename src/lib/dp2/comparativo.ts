// O comparativo com a Domínio (11/11/2026): enquanto o DP 2 roda em paralelo,
// o DP cola os totais da Domínio por pessoa e a competência mostra a diferença.
//
// Formato colado: uma pessoa por linha, separada por ";" ou tabulação (o que
// sai ao copiar do Excel) — CPF; proventos; descontos; líquido; INSS; IRRF;
// FGTS. Linha de cabeçalho é ignorada. Campo vazio fica sem comparar.
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { lerNumero } from "./entrada";

export type LinhaDoComparativo = {
  cpf: string;
  proventos: number | null;
  descontos: number | null;
  liquido: number | null;
  inss: number | null;
  irrf: number | null;
  fgts: number | null;
};

export function lerComparativo(texto: string): { linhas: LinhaDoComparativo[]; erros: string[] } {
  const linhas: LinhaDoComparativo[] = [];
  const erros: string[] = [];
  const brutas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  brutas.forEach((l, i) => {
    const partes = l.split(/;|\t/).map((p) => p.trim());
    const cpf = (partes[0] ?? "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      if (i > 0 || /\d/.test(partes[0] ?? "")) erros.push(`Linha ${i + 1}: CPF não reconhecido.`);
      return;
    }
    const [proventos, descontos, liquido, inss, irrf, fgts] = partes.slice(1, 7).map((p) => lerNumero(p));
    linhas.push({ cpf, proventos: proventos ?? null, descontos: descontos ?? null, liquido: liquido ?? null, inss: inss ?? null, irrf: irrf ?? null, fgts: fgts ?? null });
  });
  return { linhas, erros };
}

export type CampoComparado = "proventos" | "descontos" | "liquido" | "inss" | "irrf" | "fgts";
export const CAMPOS_COMPARADOS: readonly CampoComparado[] = ["proventos", "descontos", "liquido", "inss", "irrf", "fgts"];

/** Diferença até 1 centavo é arredondamento, não divergência. */
export const TOLERANCIA = 0.01;

/** A diferença DP 2 − Domínio de cada campo informado, e se algum passa da tolerância. */
export function compararValores(
  doDp2: Record<CampoComparado, number>,
  daDominio: Partial<Record<CampoComparado, number | null>>
): { diferencas: Partial<Record<CampoComparado, number>>; diverge: boolean } {
  const diferencas: Partial<Record<CampoComparado, number>> = {};
  let diverge = false;
  for (const c of CAMPOS_COMPARADOS) {
    const outro = daDominio[c];
    if (outro === null || outro === undefined) continue;
    const d = r2(doDp2[c] - outro);
    diferencas[c] = d;
    if (Math.abs(d) > TOLERANCIA) diverge = true;
  }
  return { diferencas, diverge };
}
