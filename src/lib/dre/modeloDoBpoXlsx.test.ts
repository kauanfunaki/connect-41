import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { montarMapeamento, type LancamentoDoDre } from "./calculo";
import { MAPEAMENTO_PADRAO } from "./mapeamento-padrao";
import { AVISO_DE_SEM_GRUPO, montarDreNoModeloDoBpo } from "./modeloDoBpo";
import {
  FORMATO_INTEIRO,
  FORMATO_REAIS,
  NOME_DA_ABA_CONFERENCIA,
  NOME_DA_ABA_DRE,
  gerarXlsxDoModeloDoBpo,
} from "./modeloDoBpoXlsx";

// O arquivo de verdade, lido de volta pelo ExcelJS: o desenho do modelo tem de
// estar lá — título, cabeçalho, fórmulas, formatos, congelamento — e não só nas
// linhas que a função pura devolve.

const PADRAO = montarMapeamento(MAPEAMENTO_PADRAO);

function l(categoria: string | null, reais: number, origem: "recebimento" | "pagamento"): LancamentoDoDre {
  return { categoria, valorCentavos: Math.round(reais * 100), origem };
}

const DO_MES: LancamentoDoDre[] = [
  l("Clientes - Venda de Mercadoria Fabricadas", 1000, "recebimento"),
  l("Impostos Federais - PIS", -50, "pagamento"),
  l("Frete", -100, "pagamento"),
  l("Contabilidade", -30, "pagamento"),
];

async function abrir(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(buffer as unknown as ArrayBuffer);
  return livro;
}

/** A linha cujo rótulo, na coluna A, é este. */
function numeroDa(aba: ExcelJS.Worksheet, rotulo: string): number {
  let achada = 0;
  aba.eachRow((r, n) => {
    if (!achada && r.getCell(1).value === rotulo) achada = n;
  });
  if (!achada) throw new Error(`sem a linha "${rotulo}"`);
  return achada;
}

function argb(cel: ExcelJS.Cell): string | undefined {
  const f = cel.fill as ExcelJS.FillPattern | undefined;
  return f?.fgColor?.argb;
}

describe("o .xlsx de um mês", async () => {
  const planilha = montarDreNoModeloDoBpo({
    colunas: [{ rotulo: "Out/26", lancamentos: DO_MES }],
    mapeamento: PADRAO,
    colunaDeTotal: null,
  });
  const livro = await abrir(await gerarXlsxDoModeloDoBpo(planilha, { empresa: "Padaria Pão Quente" }));
  const aba = livro.getWorksheet(NOME_DA_ABA_DRE)!;

  it("tem a aba do DRE e a de conferência, nessa ordem", () => {
    expect(livro.worksheets.map((w) => w.name)).toEqual([NOME_DA_ABA_DRE, NOME_DA_ABA_CONFERENCIA]);
  });

  it("título verde com a empresa e \"DRE REALIZADO\"; cabeçalho cinza com o mês", () => {
    expect(aba.getCell("A1").value).toBe("Padaria Pão Quente");
    expect(aba.getCell("B1").value).toBe("DRE REALIZADO");
    expect(argb(aba.getCell("B1"))).toBe("FF66FF33");
    expect(aba.getCell("B2").value).toBe("Out/26");
    expect(argb(aba.getCell("B2"))).toBe("FFD9D9D9");
    expect(aba.getRow(2).height).toBe(30);
  });

  it("os subtotais vão como fórmula, com o valor já calculado", () => {
    const rb = numeroDa(aba, "RECEITA BRUTA");
    const imp = numeroDa(aba, "IMPOSTOS SOBRE RECEITA BRUTA");
    expect(aba.getCell(`B${rb}`).value).toEqual({ formula: `SUM(B3:B${rb - 1})`, result: 1000 });
    expect(aba.getCell(`B${numeroDa(aba, "RECEITA LÍQUIDA")}`).value).toEqual({ formula: `B${rb}-B${imp}`, result: 950 });
    const ebitda = aba.getCell(`B${numeroDa(aba, "GERADOR DE CAIXA (EBITDA)")}`).value as ExcelJS.CellFormulaValue;
    expect(ebitda.result).toBe(1000 - 50 - 100 - 30);
    const pct = aba.getCell(`B${numeroDa(aba, "IMPOSTOS SOBRE RECEITA BRUTA %")}`);
    expect((pct.value as ExcelJS.CellFormulaValue).formula).toBe(`IF(B${rb}=0,"",ABS(B${imp}/B${rb}))`);
    expect((pct.value as ExcelJS.CellFormulaValue).result).toBeCloseTo(0.05);
  });

  it("formatos e cores do modelo: categoria sem centavos, total em R$, despesa em vermelho, receita em azul", () => {
    const frete = aba.getCell(`B${numeroDa(aba, "Frete")}`);
    expect(frete.value).toBe(100);
    expect(frete.numFmt).toBe(FORMATO_INTEIRO);
    expect(frete.font.color?.argb).toBe("FFFF0000");
    const rb = aba.getCell(`B${numeroDa(aba, "RECEITA BRUTA")}`);
    expect(rb.numFmt).toBe(FORMATO_REAIS);
    expect(rb.font.color?.argb).toBe("FF0070C0");
    expect(rb.font.bold).toBe(true);
    expect(aba.getCell(`B${numeroDa(aba, "IMPOSTOS SOBRE RECEITA BRUTA %")}`).numFmt).toBe("0.00%");
    expect(aba.getCell(`B${numeroDa(aba, "MARGEM DE CONTRIBUIÇÃO SOBRE RECEITA BRUTA %")}`).numFmt).toBe("0%");
    expect(argb(aba.getCell(`A${numeroDa(aba, "MARGEM DE CONTRIBUIÇÃO")}`))).toBe("FFFFFFCC");
    expect(argb(aba.getCell(`B${numeroDa(aba, "RESULTADO LÍQUIDO OPERACIONAL SOBRE RECEITA BRUTA %")}`))).toBe("FFFFFF00");
  });

  it("congela até a receita bruta, sem linhas de grade, A4 numa página", () => {
    const vista = aba.views[0] as ExcelJS.WorksheetViewFrozen & { showGridLines?: boolean };
    expect(vista.state).toBe("frozen");
    expect(vista.ySplit).toBe(numeroDa(aba, "RECEITA BRUTA"));
    expect(vista.xSplit ?? 0).toBe(0);
    expect(vista.showGridLines).toBe(false);
    expect(aba.pageSetup.paperSize).toBe(9);
    expect(aba.pageSetup.fitToPage).toBe(true);
    expect(aba.pageSetup.printArea).toBe(`A1:B${numeroDa(aba, "RESULTADO LÍQUIDO OPERACIONAL SOBRE RECEITA BRUTA %")}`);
  });

  it("a conferência diz onde cada categoria entrou", () => {
    const conf = livro.getWorksheet(NOME_DA_ABA_CONFERENCIA)!;
    expect(conf.getRow(1).values).toEqual([undefined, "Categoria", "Origem", "Valor no período", "Onde entrou no DRE"]);
    const linhas: unknown[][] = [];
    conf.eachRow((r, n) => {
      if (n > 1) linhas.push((r.values as unknown[]).slice(1));
    });
    expect(linhas).toContainEqual(["Frete", "Pagamento", 100, "CUSTO OPERACIONAL TOTAL"]);
    expect(linhas).toContainEqual(["Contabilidade", "Pagamento", 30, "CUSTO ADMINISTRATIVO TOTAL"]);
  });

  it("sem lançamento sem grupo, sem aviso embaixo", () => {
    const ultima = numeroDa(aba, "RESULTADO LÍQUIDO OPERACIONAL SOBRE RECEITA BRUTA %");
    expect(aba.getCell(`A${ultima + 2}`).value).toBeNull();
  });
});

describe("o .xlsx do ano", async () => {
  const planilha = montarDreNoModeloDoBpo({
    colunas: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"].map((m, i) => ({
      rotulo: `${m}/26`,
      lancamentos: i === 9 ? [...DO_MES, l("Categoria Inventada", -7, "pagamento")] : [],
    })),
    mapeamento: PADRAO,
    colunaDeTotal: "Total 2026",
  });
  const livro = await abrir(await gerarXlsxDoModeloDoBpo(planilha, { empresa: "Padaria Pão Quente" }));
  const aba = livro.getWorksheet(NOME_DA_ABA_DRE)!;

  it("doze meses e o total, com o título mesclado por cima de todos", () => {
    expect(aba.getCell("B2").value).toBe("Jan/26");
    expect(aba.getCell("M2").value).toBe("Dez/26");
    expect(aba.getCell("N2").value).toBe("Total 2026");
    expect(aba.model.merges).toContain("B1:N1");
  });

  it("a coluna do total soma os meses por fórmula", () => {
    const frete = numeroDa(aba, "Frete");
    expect(aba.getCell(`N${frete}`).value).toEqual({ formula: `SUM(B${frete}:M${frete})`, result: 100 });
    expect(aba.getCell(`B${frete}`).value).toBe(0);
  });

  it("a coluna A fica presa — doze meses não cabem ao lado dos rótulos", () => {
    const vista = aba.views[0] as ExcelJS.WorksheetViewFrozen;
    expect(vista.xSplit).toBe(1);
    expect(aba.pageSetup.orientation).toBe("landscape");
  });

  it("com lançamento sem grupo, avisa embaixo do DRE", () => {
    const ultima = numeroDa(aba, "RESULTADO LÍQUIDO OPERACIONAL SOBRE RECEITA BRUTA %");
    expect(aba.getCell(`A${ultima + 2}`).value).toBe(AVISO_DE_SEM_GRUPO);
  });
});
