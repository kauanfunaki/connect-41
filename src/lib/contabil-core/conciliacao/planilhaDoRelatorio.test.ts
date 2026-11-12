// Testes-gabarito da planilha do relatório da conciliação (porte de `gerar_planilha`, 12/11/2026).
//
// `gabarito/planilha-conciliacao-*.json` traz, para cada relatório do gabarito do serviço, a planilha
// do original lida de volta pelo openpyxl: por folha, o título, as células (valor, tipo, formato de
// número, negrito e preenchimento), as larguras, o painel congelado e o filtro. Aqui a planilha do
// porte é gerada a partir do MESMO relatório, lida de volta pelo exceljs e comparada.

import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";
import { dec } from "../motor/decimal";
import { casosPlanilha, casosServico, relatorioDoGabarito, type CelulaDespejo, type FolhaDespejo } from "./gabarito/servicoConciliacao";
import { nomeDaPlanilha, planilhaDaConciliacao } from "./planilhaDoRelatorio";
import { relatorioDoJson } from "./relatorio";

async function despejo(conteudo: Uint8Array): Promise<FolhaDespejo[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(conteudo as unknown as ArrayBuffer);
  return wb.worksheets.map((ws) => {
    const celulas: CelulaDespejo[] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      for (let k = 1; k <= row.cellCount; k++) {
        const c = row.getCell(k);
        const fmt = c.numFmt ?? "General";
        const negrito = !!c.font?.bold;
        const fill = c.fill?.type === "pattern" && c.fill.pattern === "solid" ? (c.fill.fgColor?.argb ?? "").slice(-6) : null;
        const v = c.value;
        if (v === null && fmt === "General" && !negrito && fill === null) continue;
        let tipo: CelulaDespejo[1];
        let valor: CelulaDespejo[2];
        if (v === null) [tipo, valor] = [null, null];
        else if (v instanceof Date) [tipo, valor] = ["d", v.toISOString().slice(0, 10)];
        else if (typeof v === "number") [tipo, valor] = ["n", v === 0 ? 0 : v];
        else if (typeof v === "string") [tipo, valor] = ["s", v];
        else if (typeof v === "boolean") [tipo, valor] = ["b", v];
        else throw new Error(`valor inesperado em ${c.address}: ${JSON.stringify(v)}`);
        celulas.push([c.address, tipo, valor, fmt, negrito, fill]);
      }
    }
    const larguras: [number, number][] = [];
    for (let k = 1; k <= ws.columnCount; k++) {
      const w = ws.getColumn(k).width;
      if (w !== undefined) larguras.push([k, w]);
    }
    const vista = ws.views?.[0];
    return {
      titulo: ws.name,
      celulas,
      larguras,
      congelado: vista?.state === "frozen" ? (vista.topLeftCell ?? null) : null,
      filtro: typeof ws.autoFilter === "string" ? ws.autoFilter : null,
    };
  });
}

const servico = new Map(casosServico().map((c) => [c.id, c]));
const planilhas = casosPlanilha();

describe("gabarito da planilha da conciliação (a do Python, lida de volta)", () => {
  test("há uma planilha para cada relatório do gabarito", () => {
    expect(planilhas.length).toBe([...servico.values()].filter((c) => c.relatorio).length);
    const titulos = new Set(planilhas.flatMap((p) => p.folhas.map((f) => f.titulo)));
    expect([...titulos].sort()).toEqual(["Aplicação não conferida", "Pendências", "Por dia", "Resumo"]);
  });

  test("cada planilha sai igual", async () => {
    for (const caso of planilhas) {
      const relatorio = relatorioDoJson(relatorioDoGabarito(servico.get(caso.id)!.relatorio!));
      const conteudo = await planilhaDaConciliacao(relatorio);
      expect(await despejo(conteudo), `caso ${caso.id}`).toEqual(caso.folhas);
    }
  }, 300_000);
});

test("nome do arquivo baixado", () => {
  const razao = {
    empresa: "", cnpj: "", periodoInicio: "2025-02-01", periodoFim: "2025-02-28", contaCodigo: "2699",
    contaClassificacao: "", contaDescricao: "", lancamentos: [], totalDebito: dec("0"), totalCredito: dec("0"),
  };
  expect(nomeDaPlanilha(razao)).toBe("conciliacao_2699_2025-02.xlsx");
  expect(nomeDaPlanilha({ ...razao, contaCodigo: "" })).toBe("conciliacao_conta_2025-02.xlsx");
});
