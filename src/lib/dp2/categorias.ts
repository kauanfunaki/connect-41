// As categorias de trabalhador do DP 2 (Tabela 1 do eSocial) e o regime de
// cálculo de cada uma (12/11/2026, fase 3d).
//
// - CLT: empregado (101 a 111). Folha completa, FGTS, férias, 13º, rescisão,
//   S-2200/S-2299.
// - CONTRIBUINTE_INDIVIDUAL: sócio com pró-labore (723) e autônomo por RPA
//   (701). INSS de 11% retido até o teto, IRRF pela tabela, 20% patronal (ou
//   no DAS); sem FGTS, férias, 13º e provisões. S-2300/S-2399 (opcionais).
// - ESTAGIARIO: estagiário (901). Bolsa só com IRRF; sem INSS, FGTS e
//   encargos. S-2300/S-2399 obrigatórios.
//
// Puro, sem banco.

export type RegimeDoTrabalhador = "CLT" | "CONTRIBUINTE_INDIVIDUAL" | "ESTAGIARIO";

export const CATEGORIAS: [string, string][] = [
  ["101", "101 · Empregado geral"],
  ["102", "102 · Empregado rural"],
  ["103", "103 · Aprendiz"],
  ["105", "105 · Contrato por prazo determinado"],
  ["106", "106 · Contrato temporário"],
  ["111", "111 · Contrato intermitente"],
  ["723", "723 · Sócio com pró-labore"],
  ["701", "701 · Autônomo (RPA)"],
  ["901", "901 · Estagiário"],
];

export function regimeDaCategoria(categoria: string | null | undefined): RegimeDoTrabalhador {
  if (categoria === "901") return "ESTAGIARIO";
  if (categoria === "701" || categoria === "723") return "CONTRIBUINTE_INDIVIDUAL";
  return "CLT";
}

/** Sem vínculo de emprego: não entra em 13º, férias, rescisão, S-2200 e S-2299. */
export const semVinculo = (categoria: string | null | undefined) => regimeDaCategoria(categoria) !== "CLT";

/** A alíquota do INSS retido do contribuinte individual pela empresa (Lei 10.666/2003, art. 4º). */
export const INSS_CONTRIBUINTE_INDIVIDUAL = 11;
