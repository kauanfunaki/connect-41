import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PlanilhaInvalida, chaveDeNegocio, indexarNomes, lerPlanilhaDoBpo, numerosDaNota } from "./planilhaDoBpo";

async function planilha(linhas: (string | number | Date | null)[][], aba = "Pagamentos realizados Pagam...") {
  const livro = new ExcelJS.Workbook();
  const w = livro.addWorksheet(aba);
  w.addRow(["Relatório de pagamentos"]);
  w.addRow(["Fornecedor", "Nota Fiscal", "Categoria", "Pago ou Recebido", "Data de Pagto ou Recbto (completa)", "Situação"]);
  for (const l of linhas) w.addRow(l);
  return new Uint8Array(await livro.xlsx.writeBuffer());
}

describe("lerPlanilhaDoBpo", () => {
  it("cada linha de fornecedor vira uma fatura, na posição dela, com o comprovante ligado pelo número", async () => {
    const bytes = await planilha([
      ["COMPANHIA  DE LOCACAO DAS AMERICAS", "743426 00F", "Aluguel de veículos", 2090.75, new Date("2025-07-28T00:00:00Z"), "Pago"],
      ["COMPANHIA DE LOCACAO DAS AMERICAS", "743426 00F", "Aluguel de veículos", 2090.75, new Date("2025-07-28T00:00:00Z"), "Pago"],
      [null, "", "", null, null, ""],
      ["ARVAL BRASIL LTDA", "56 / 5700", "Aluguel de veículos", null, "", "Em aberto"],
    ]);
    const linhas = await lerPlanilhaDoBpo(bytes, ["ARVAL - FATURA 5700.pdf", "outro.pdf"]);
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toMatchObject({ posicao: 1, nome: "COMPANHIA DE LOCACAO DAS AMERICAS", numero: "743426 00F", dataPagamento: "2025-07-28", competencia: "2025-07", centavos: 209075, categoria: "fatura_aluguel_veiculo", situacao: "ok" });
    // A frota: linhas idênticas não colidem, porque a posição entra na chave.
    expect(linhas[0].chaveNegocio).not.toBe(linhas[1].chaveNegocio);
    expect(linhas[2]).toMatchObject({ posicao: 3, centavos: null, situacao: "conferir", comprovante: "ARVAL - FATURA 5700.pdf" });
    expect(linhas[2].observacao).toBe("o relatório não traz valor nesta linha | o relatório não traz data de pagamento | situação no relatório do BPO: Em aberto");
  });

  it("sem a aba ou sem a coluna, diz o que falta", async () => {
    await expect(lerPlanilhaDoBpo(await planilha([], "Outra"))).rejects.toThrow(PlanilhaInvalida);
    await expect(lerPlanilhaDoBpo(new Uint8Array([1, 2, 3]))).rejects.toThrow("não é uma planilha");
  });
});

describe("os auxiliares do motor", () => {
  it("números da nota, índice dos PDFs e chave de negócio", () => {
    expect(numerosDaNota("56 / 57; 12")).toEqual([]);
    expect(numerosDaNota("FAT 1234/5678")).toEqual(["1234", "5678"]);
    expect([...indexarNomes(["MOVIDA - FATURA 06330021.pdf", "C20391_F514527.pdf"])]).toEqual([["06330021", "MOVIDA - FATURA 06330021.pdf"], ["20391", "C20391_F514527.pdf"], ["514527", "C20391_F514527.pdf"]]);
    expect(chaveDeNegocio("fatura", "", " arval  brasil ", "2025-01-10", 123450, "7")).toBe("fatura|ARVAL BRASIL|2025-01-10|1234.50|7");
    expect(chaveDeNegocio("recibo", "111.222.333-44", "X", "", null)).toBe("recibo|11122233344||");
    expect(chaveDeNegocio("recibo", "", "", "", 1)).toBe("");
  });
});
