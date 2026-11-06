import { describe, expect, it } from "vitest";
import { newStudy } from "./avaliacao/model";
import { dreKeys } from "./avaliacao/assessment";
import { linhasDaTransicao, nomeDoArquivoDoRelatorio, relatorioEmMarkdown } from "./relatorio";

const completa = () => {
  const s = { ...newStudy("quick", 2026), name: "Transportes Modelo", cnpj: "12345678000195" };
  s.values = Object.fromEntries(dreKeys.map((k) => [k, 0]));
  Object.assign(s.values, { receita_bruta: 1200000, custos_diretos: 600000, folha_encargos_dre: 120000, encargos: 20000, rbt12: 1200000, fs12: 120000, base_cbs: 100000, base_ibs: 100000, real_adjust: 0 });
  s.base.simpleMethod = "reference";
  s.eligibility = { simple: "yes", presumed: "yes", real: "yes" };
  s.assumptionsReviewed = true;
  return s;
};

describe("relatório em Markdown", () => {
  it("traz os quatro cenários, a revisão e a memória, sem a seção de documentos", () => {
    const md = relatorioEmMarkdown({ estudo: completa(), ano: 2029, revisao: 3, alteracoesNaoSalvas: false, avaliacaoId: "abc" });
    expect(md).toContain("# Connect Tributário — avaliação");
    expect(md).toContain("Transportes Modelo · 12345678000195");
    expect(md).toContain("Revisão salva: 3.");
    for (const regime of ["Simples Nacional", "Lucro Presumido", "Lucro Real"]) expect(md).toContain(regime);
    expect(md).toContain('"studyId": "abc"');
    expect(md).not.toContain("## Documentos");
  });

  it("marca rascunho e alterações não salvas", () => {
    const md = relatorioEmMarkdown({ estudo: completa(), ano: 2027, revisao: null, alteracoesNaoSalvas: true, avaliacaoId: null });
    expect(md).toContain("Revisão salva: rascunho — contém alterações ainda não salvas.");
  });

  it("nome do arquivo usa o CNPJ ou 'rascunho'", () => {
    expect(nomeDoArquivoDoRelatorio(completa())).toBe("Connect_Tributario_Avaliacao_12345678000195.md");
    expect(nomeDoArquivoDoRelatorio({ ...completa(), cnpj: "" })).toBe("Connect_Tributario_Avaliacao_rascunho.md");
  });
});

describe("CSV da transição", () => {
  it("um regime por ano de 2027 a 2033, com vírgula decimal", () => {
    const linhas = linhasDaTransicao(completa());
    expect(linhas[0]).toEqual(["Ano", "Regime", "Valor anual", "Situação", "Pendências"]);
    expect(linhas).toHaveLength(1 + 7 * 4);
    expect(linhas[1][0]).toBe(2027);
    expect(String(linhas[1][2])).toMatch(/^\d+,\d{2}$/);
  });
});
