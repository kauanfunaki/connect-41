// Gabarito de `importar_lote` (scripts/contabil-core/gabarito_plano.py): o serviço original rodou com
// um banco de mentira sobre os casos de tests/integration/test_plano_contas.py e outros inventados.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classificarPorFaixa,
  codigoParaTupla,
  ErroDoLote,
  planejarLote,
  reprPy,
  validarConta,
  type ContaDoPlano,
  type ErroDeLinha,
  type FaixaDoPlano,
} from "./loteDoPlano";
import type { LinhaDoPlano } from "./planilhaDoPlano";

type ContaPy = ContaDoPlano & { paiCodigo: string | null };
type Lote = {
  entrada: {
    linhas: LinhaDoPlano[];
    faixas?: FaixaDoPlano[];
    existentes?: (ContaDoPlano & { movimentada?: boolean })[];
    proximoNumero?: number;
    falhar?: string[];
  };
  resultado:
    | { importadas: number; atualizadas: number; duplicadas: number; erros: ErroDeLinha[]; novas: ContaPy[]; existentes: ContaPy[] }
    | { excecao: string; mensagem: string };
};

const { lotes } = JSON.parse(readFileSync(join(__dirname, "gabarito", "plano.json"), "utf8")) as { lotes: Record<string, Lote> };

describe("gabarito de importar_lote", () => {
  for (const [caso, { entrada, resultado }] of Object.entries(lotes)) {
    it(caso, () => {
      const existentes = (entrada.existentes ?? []).map((c, i) => ({
        id: `e${i}`, contaNumero: c.contaNumero, codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, tipoSa: c.tipoSa,
      }));
      const falhar = new Set(entrada.falhar ?? []);
      const planejar = () =>
        planejarLote({
          linhas: entrada.linhas,
          faixas: entrada.faixas ?? [],
          existentes,
          movimentadas: new Set((entrada.existentes ?? []).flatMap((c, i) => (c.movimentada ? [`e${i}`] : []))),
          proximoNumero: entrada.proximoNumero ?? 1,
          falhaAoCriar: (c) => (falhar.has(c.codigo) ? `falha simulada ao gravar ${c.codigo}` : null),
        });
      if ("excecao" in resultado) {
        expect(planejar).toThrow(ErroDoLote);
        expect(planejar).toThrow(resultado.mensagem);
        return;
      }
      const plano = planejar();
      expect({ importadas: plano.importadas, atualizadas: plano.atualizadas, duplicadas: plano.duplicadas }).toEqual({
        importadas: resultado.importadas,
        atualizadas: resultado.atualizadas,
        duplicadas: resultado.duplicadas,
      });
      expect(plano.erros).toEqual(resultado.erros);
      expect(plano.novas.map((c) => ({ codigo: c.codigo, contaNumero: c.contaNumero, descricao: c.descricao, tipo: c.tipo, tipoSa: c.tipoSa, paiCodigo: c.paiCodigo }))).toEqual(
        resultado.novas,
      );
      const finais = existentes.map((c) => {
        const depois = plano.alteradas.find((a) => a.id === c.id)?.depois ?? c;
        return { codigo: c.codigo, contaNumero: depois.contaNumero, descricao: depois.descricao, tipo: depois.tipo, tipoSa: depois.tipoSa, paiCodigo: null };
      });
      expect(finais).toEqual(resultado.existentes);
    });
  }
});

describe("peças do lote", () => {
  it("compara códigos como números, com o limite incluído", () => {
    const faixas = [{ tipo: "despesa", codigoDe: "3.4", codigoAte: "3.5.1.07.004" }];
    expect(classificarPorFaixa("3.5.1.07.004", faixas)).toBe("despesa");
    expect(classificarPorFaixa("3.5.1.07.005", faixas)).toBeNull();
    expect(classificarPorFaixa("3.10", [{ tipo: "receita", codigoDe: "3.9", codigoAte: "3.99" }])).toBe("receita");
    expect(codigoParaTupla("1. 2")).toEqual([BigInt(1), BigInt(2)]);
    expect(codigoParaTupla("1.a")).toBeNull();
  });

  it("repr do Python", () => {
    expect(reprPy("it's")).toBe(`"it's"`);
    expect(reprPy(`a'b"c`)).toBe(`'a\\'b"c'`);
    expect(reprPy("ação​\x00\t\xa0")).toBe("'ação\\u200b\\x00\\t\\xa0'");
  });

  it("a conta válida sai normalizada", () => {
    expect(validarConta({ contaNumero: null, codigo: " 1.1 ", descricao: " Caixa ", tipo: "PL", tipoSa: " s " })).toEqual({
      conta: { contaNumero: null, codigo: "1.1", descricao: "Caixa", tipo: "patrimonio_liquido", tipoSa: "S" },
    });
  });
});
