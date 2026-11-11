// Gabarito do modelo de regras e da leitura de planilhas de cadastro (scripts/contabil-core/gabarito_regras.py).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reprFloat, type Celula } from "../planilha/celula";
import { lerPlanilhasExcel } from "../planilha/excel";
import { lerRelatorioRegras } from "./relatorioRegras";

type Caso = { nome: string; bytes: string; planilhas?: unknown; erro_planilhas?: string; regras?: unknown; erro_regras?: string };
const casos: Caso[] = JSON.parse(readFileSync(join(__dirname, "gabarito", "regras.json"), "utf8"));

function paraPython(c: Celula): unknown {
  if (c === null || typeof c === "string") return c;
  if (c.tipo === "int") return Number(c.valor);
  if (c.tipo === "float") return { $f: reprFloat(c.valor) };
  if (c.tipo === "bool") return c.valor;
  if (c.tipo === "datahora") return { $dt: c.valor };
  return c.valor;
}

describe("planilhas de cadastro e modelo de regras (gabarito do Python)", () => {
  for (const caso of casos) {
    it(caso.nome, () => {
      const bytes = Buffer.from(caso.bytes, "hex");
      if (caso.erro_planilhas !== undefined) expect(() => lerPlanilhasExcel(bytes, caso.nome)).toThrow(caso.erro_planilhas);
      else {
        const lidas = lerPlanilhasExcel(bytes, caso.nome).map((p) => ({ nome: p.nome, linhas: p.linhas.map((l) => l.map(paraPython)) }));
        expect(lidas).toEqual(caso.planilhas);
      }
      if (caso.erro_regras !== undefined) expect(() => lerRelatorioRegras(bytes, caso.nome)).toThrow(caso.erro_regras);
      else expect(lerRelatorioRegras(bytes, caso.nome)).toEqual(caso.regras);
    });
  }
});
