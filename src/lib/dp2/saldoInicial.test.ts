import { describe, expect, it } from "vitest";
import { mediaDeVariaveis } from "./medias";
import { lerCompetencia, lerSaldoInicial, mesesDoSaldoInicial, resumirSaldoInicial } from "./saldoInicial";

const pessoas = [
  { id: "p1", cpf: "12345678909" },
  { id: "p2", cpf: "01234567890" },
];
const rub = (id: string, codigo: string, extra: Partial<{ tipo: string; mediaFerias: boolean; mediaDecimo: boolean; mediaRescisao: boolean }> = {}) => ({
  id,
  codigo,
  nome: `Rubrica ${codigo}`,
  tipo: "PROVENTO",
  mediaFerias: true,
  mediaDecimo: true,
  mediaRescisao: true,
  ...extra,
});
const rubricas = [rub("he", "150"), rub("ad", "025"), rub("sal", "001", { mediaFerias: false, mediaDecimo: false, mediaRescisao: false }), rub("vt", "900", { tipo: "DESCONTO" })];

describe("lerCompetencia", () => {
  it("aceita MM/AAAA, AAAA-MM e MMAAAA", () => {
    expect(lerCompetencia("03/2026")).toBe("2026-03");
    expect(lerCompetencia("3/2026")).toBe("2026-03");
    expect(lerCompetencia("2026-11")).toBe("2026-11");
    expect(lerCompetencia("122025")).toBe("2025-12");
    expect(lerCompetencia("13/2026")).toBeNull();
    expect(lerCompetencia("março")).toBeNull();
  });
});

describe("lerSaldoInicial", () => {
  it("lê ; e tabulação, ignora o cabeçalho e soma linhas repetidas", () => {
    const texto = "CPF;Competência;Rubrica;Valor\n123.456.789-09;03/2026;150;412,30\n123.456.789-09\t03/2026\t150\t100,00\n1234567890;04/2026;25;1.000,00\n";
    const r = lerSaldoInicial(texto, pessoas, rubricas);
    expect(r.erros).toEqual([]);
    expect(r.linhas).toEqual([
      { personId: "p1", competencia: "2026-03", rubricaId: "he", valor: 512.3 },
      { personId: "p2", competencia: "2026-04", rubricaId: "ad", valor: 1000 },
    ]);
  });

  it("aponta CPF, mês, rubrica e valor que não batem, com o número da linha", () => {
    const texto = ["99999999999;03/2026;150;1", "12345678909;03/26;150;1", "12345678909;03/2026;777;1", "12345678909;03/2026;150;abc", "12345678909;03/2026"].join("\n");
    const r = lerSaldoInicial(texto, pessoas, rubricas);
    expect(r.linhas).toEqual([]);
    expect(r.erros).toHaveLength(5);
    expect(r.erros[0]).toMatch(/^Linha 1: CPF/);
    expect(r.erros[1]).toMatch(/^Linha 2: competência/);
    expect(r.erros[2]).toMatch(/^Linha 3: rubrica 777/);
    expect(r.erros[3]).toMatch(/^Linha 4: valor/);
    expect(r.erros[4]).toMatch(/^Linha 5: são 4 campos/);
  });

  it("recusa mês que já é do DP 2 e avisa de rubrica fora da média", () => {
    const r = lerSaldoInicial("12345678909;06/2026;150;10\n12345678909;05/2026;001;2000\n12345678909;05/2026;900;50", pessoas, rubricas, "2026-06");
    expect(r.erros).toEqual([expect.stringMatching(/já é mês do DP 2/)]);
    expect(r.linhas).toHaveLength(2);
    expect(r.avisos.join(" ")).toMatch(/001 · Rubrica 001/);
    expect(r.avisos.join(" ")).toMatch(/900 · Rubrica 900/);
  });
});

describe("mesesDoSaldoInicial", () => {
  const he = rubricas[0];
  const so13 = rub("c", "300", { mediaFerias: false, mediaRescisao: false });
  const linhas = [
    { competencia: "2026-01", valor: 300, rubrica: he },
    { competencia: "2026-01", valor: 100, rubrica: so13 },
    { competencia: "2026-02", valor: 600, rubrica: he },
    { competencia: "2026-03", valor: 999, rubrica: he },
  ];

  it("vira meses da média, fora os que o DP 2 já fechou", () => {
    const meses = mesesDoSaldoInicial(linhas, new Set(["2026-03"]));
    expect(meses.map((m) => m.competencia)).toEqual(["2026-01", "2026-02"]);
    expect(mediaDeVariaveis(meses, "FERIAS").media).toBe(450);
    expect(mediaDeVariaveis(meses, "DECIMO").media).toBe(500);
  });
});

describe("resumirSaldoInicial", () => {
  it("conta meses, período, total e pendentes por pessoa", () => {
    const r = resumirSaldoInicial([
      { personId: "p1", competencia: "2026-02", valor: 10, conferido: true },
      { personId: "p1", competencia: "2026-01", valor: 5.5, conferido: false },
      { personId: "p1", competencia: "2026-01", valor: 1, conferido: false },
    ]);
    expect(r).toEqual([{ personId: "p1", meses: 2, de: "2026-01", ate: "2026-02", total: 16.5, pendentes: 2 }]);
  });
});
