// Gabarito do leitor da planilha do plano de contas (scripts/contabil-core/gabarito_plano.py): o que o
// `_parse_planilha` e o `_normaliza_linha_cabecalho` do original devolvem para planilhas inventadas.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Celula } from "../planilha/celula";
import { ErroPlanilhaDoPlano, lerPlanilhaDoPlano, normalizarCabecalho, type LinhaDoPlano } from "./planilhaDoPlano";

type ValorPy = null | string | { $b: boolean } | { $i: string } | { $f: string } | { $d: string } | { $t: string };
type ResultadoPy = { linhas: LinhaDoPlano[] } | { erro: string } | { excecao: string; mensagem: string };
type Gabarito = {
  planilhas: Record<string, { nome: string; base64: string; resultado: ResultadoPy }>;
  cabecalhos: { entrada: ValorPy[]; saida: string[] }[];
};

const gabarito = JSON.parse(readFileSync(join(__dirname, "gabarito", "plano.json"), "utf8")) as Gabarito;

function celula(v: ValorPy): Celula {
  if (v === null || typeof v === "string") return v;
  if ("$b" in v) return { tipo: "bool", valor: v.$b };
  if ("$i" in v) return { tipo: "int", valor: BigInt(v.$i) };
  if ("$f" in v) return { tipo: "float", valor: v.$f === "nan" ? NaN : Number(v.$f) };
  if ("$d" in v) return { tipo: "datahora", valor: v.$d };
  return { tipo: "duracao", valor: v.$t };
}

/** Mensagens que dependem da biblioteca do original e que o porte não repete ao pé da letra. */
const SO_O_COMECO: Record<string, string> = { "x-zip-sem-planilha": "Erro ao ler XLSX: " };

describe("gabarito de _parse_planilha", () => {
  for (const [caso, { nome, base64, resultado }] of Object.entries(gabarito.planilhas)) {
    it(caso, () => {
      const bytes = new Uint8Array(Buffer.from(base64, "base64"));
      const ler = () => lerPlanilhaDoPlano(bytes, nome);
      if ("linhas" in resultado) {
        expect(ler()).toEqual(resultado.linhas);
        return;
      }
      let erro: unknown;
      try {
        ler();
      } catch (e) {
        erro = e;
      }
      expect(erro).toBeInstanceOf(ErroPlanilhaDoPlano);
      const mensagem = (erro as Error).message;
      if ("erro" in resultado) {
        if (SO_O_COMECO[caso]) expect(mensagem.startsWith(SO_O_COMECO[caso])).toBe(true);
        else expect(mensagem).toBe(resultado.erro);
      } else {
        // `csv.Error` não tratado no original (erro 500): aqui vira recusa com a mesma causa.
        expect(resultado.excecao).toBe("csv.Error");
        expect(mensagem).toBe(`Não foi possível ler o CSV: ${resultado.mensagem}`);
      }
    });
  }
});

describe("gabarito de _normaliza_linha_cabecalho", () => {
  gabarito.cabecalhos.forEach(({ entrada, saida }, i) => {
    it(`cabeçalho ${i + 1}`, () => {
      expect(normalizarCabecalho(entrada.map(celula))).toEqual(saida);
    });
  });
});
