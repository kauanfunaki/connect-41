// Gabarito dos documentos do financeiro (scripts/contabil-core/gabarito_financeiro.py): o que o
// `ler_financeiro`, o `validar_conteudo`, o `ler_omie` e o `ler_folha_titulos` do Contábil Core devolvem
// para os arquivos da suíte do original e para os documentos inventados (planilhas de pagamentos,
// recebimentos e títulos; PDFs de saldo conciliado e do Omie), e as funções internas (`_valor`,
// `_texto`, `_data_planilha`, `_normalizar`).
import { readdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { texto as textoDec } from "../motor/decimal";
import type { Celula } from "../planilha/celula";
import { bytesDoArquivo, celula as celulaDoGabarito, dataJson, decJson, esperado, nomeDoArquivo, PASTA, registros, type Json, type Registro } from "./gabarito/ler";
import { dataFinanceiro, normalizarFinanceiro, textoFinanceiro, valorFinanceiro } from "./financeiroComum";
import { FinanceiroInvalido, lerFinanceiro, lerOmieDoArquivo, validarConteudo, type OpcoesFinanceiro } from "./financeiroDocumentos";
import { lerFolhaTitulos } from "./financeiroTitulos";
import type { DocumentoFinanceiro, LinhaFinanceiro } from "./financeiroTipos";

/** A célula como o Python a recebeu, com o infinito e o NaN do `repr(float)`. */
function celula(j: Json): Celula {
  if (j !== null && typeof j === "object" && !Array.isArray(j) && typeof j.$f === "string") {
    const especiais: Record<string, number> = { inf: Infinity, "-inf": -Infinity, nan: NaN };
    if (j.$f in especiais) return { tipo: "float", valor: especiais[j.$f] };
  }
  return celulaDoGabarito(j);
}

const linhaPy = (l: LinhaFinanceiro): Json => ({
  data: dataJson(l.data),
  valor: { $dec: textoDec(l.valor) },
  historico: l.historico,
  favorecido: l.favorecido,
  documento: l.documento,
  categoria: l.categoria,
  parcela: l.parcela,
  banco: l.banco,
  referencia: l.referencia,
  observacao: l.observacao,
  documento_favorecido: l.documentoFavorecido,
});

const documentoPy = (d: DocumentoFinanceiro): Json => ({
  linhas: d.linhas.map(linhaPy),
  banco: d.banco,
  avisos: d.avisos,
  cnpj: d.cnpj,
  titulos_abertos: d.titulosAbertos.map(linhaPy),
});

const objeto = (j: Json | undefined): Record<string, Json> => (j !== null && typeof j === "object" && !Array.isArray(j) ? j : {});

/** As constantes trocadas pelos testes do original (`kwargs["$opcoes"]`). */
function opcoes(r: Registro): OpcoesFinanceiro {
  const o = objeto(r.kwargs.$opcoes);
  const sequencia = Array.isArray(o.relogio) ? (o.relogio as number[]) : null;
  let i = 0;
  return {
    limites: objeto(o.limites) as OpcoesFinanceiro["limites"],
    limitesApoio: objeto(o.limitesApoio) as OpcoesFinanceiro["limitesApoio"],
    relogio: sequencia ? () => sequencia[Math.min(i++, sequencia.length - 1)] : undefined,
  };
}

type Saida = Pick<Registro, "result" | "error">;

async function executar(fn: () => Promise<Json> | Json): Promise<Saida> {
  try {
    return { result: await fn() };
  } catch (e) {
    if (e instanceof Error) return { error: { tipo: e.name, mensagem: e.message } };
    throw e;
  }
}

const FUNCOES: Record<string, (r: Registro) => Promise<Json> | Json> = {
  "documentos.ler_financeiro": async (r) => documentoPy(await lerFinanceiro(bytesDoArquivo(r.args[0]), String(r.args[1]), opcoes(r))),
  "documentos.validar_conteudo": async (r) => {
    await validarConteudo(bytesDoArquivo(r.args[0]), String(r.args[1]), opcoes(r));
    return null;
  },
  "omie.ler_omie": async (r) => documentoPy(await lerOmieDoArquivo(bytesDoArquivo(r.args[0]))),
  "titulos.ler_folha_titulos": (r) => {
    const linhas = (r.args[1] as Json[][]).map((l) => l.map(celula));
    return lerFolhaTitulos(String(r.args[0]), linhas).map((ls) => ls.map(linhaPy));
  },
  "documentos._valor": (r) => decJson(valorFinanceiro(celula(r.args[0]), String(r.args[1]), r.kwargs.assinado === true)),
  "documentos._texto": (r) => textoFinanceiro(celula(r.args[0])),
  "documentos._data_planilha": (r) => dataJson(dataFinanceiro(celula(r.args[0]), String(r.args[1]))),
  "documentos._normalizar": (r) => normalizarFinanceiro(celula(r.args[0])),
};

const todos = readdirSync(PASTA)
  .filter((n) => /^financeiro-chamadas-\d+\.json$/.test(n))
  .flatMap((n) => registros(n));

const titulo = (r: Registro) => {
  const arquivo = r.args[0] && typeof r.args[0] === "object" && "$arquivo" in (r.args[0] as object) ? nomeDoArquivo(r.args[0]) : JSON.stringify(r.args).slice(0, 70);
  return `${r.fn} ${arquivo} ${r.args[1] !== undefined && typeof r.args[1] === "string" ? r.args[1] : ""} ${r.kwargs.$opcoes ? JSON.stringify(r.kwargs.$opcoes) : ""}`;
};

describe("lerFinanceiro × ler_financeiro", () => {
  it("o gabarito cobre a suíte, os layouts e as recusas", () => {
    const leituras = todos.filter((r) => r.fn === "documentos.ler_financeiro");
    expect(leituras.length).toBeGreaterThanOrEqual(250);
    expect(leituras.filter((r) => r.result).length).toBeGreaterThanOrEqual(100);
    const recusas = new Set(leituras.filter((r) => r.error).map((r) => r.error!.mensagem.replace(/\d+/g, "N").slice(0, 40)));
    expect(recusas.size).toBeGreaterThanOrEqual(60);
    expect(todos.filter((r) => r.fn === "omie.ler_omie" && r.result).length).toBeGreaterThanOrEqual(10);
  });

  for (const r of todos) {
    it(titulo(r), async () => {
      const fn = FUNCOES[r.fn];
      expect(fn, r.fn).toBeDefined();
      const saida = await executar(() => fn(r));
      const alvo = esperado(r);
      // `ler_omie` chamado direto deixa escapar o `ValueError` do Python; no porte é um `Error`.
      // O que importa é que não vira recusa (o `ler_financeiro` troca pela frase genérica).
      if (r.fn === "omie.ler_omie" && alvo.error && alvo.error.tipo !== "FinanceiroInvalido") {
        expect(saida.error?.tipo).toBeDefined();
        expect(saida.error?.tipo).not.toBe(FinanceiroInvalido.name);
        return;
      }
      expect(saida).toEqual(alvo);
    });
  }
});
