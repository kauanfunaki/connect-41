// Gabarito das sugestões de conferência do financeiro (scripts/contabil-core/gabarito_financeiro.py):
// as chamadas de `sugerir` da suíte do original, as sorteadas com semente fixa (todos os tipos de
// comparação, vínculos, limites de busca trocados) e as dirigidas a cada ramo (parcelas com ajuste,
// N para 1, lote SISPAG com um e vários alvos), mais `identidade` e `normalizar` chamadas direto.
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { esperado, executar, PASTA, registros, type Json, type Registro } from "./gabarito/ler";
import { identidade, normalizar, sugerir, type LinhaParaSugestao, type SugestoesFinanceiro, type VinculoParaSugestao } from "./sugestoesFinanceiro";
import type { TipoComparacao } from "./financeiroTipos";

/** O envelope do porte com as chaves do original. */
const comoPy = (s: SugestoesFinanceiro): Json => ({
  versao: s.versao,
  tipo_comparacao: s.tipoComparacao,
  items: s.items.map((i) => ({
    id: i.id,
    financeiro_ids: i.financeiroIds,
    comparacao_ids: i.comparacaoIds,
    criterio: i.criterio,
    ambigua: i.ambigua,
    exige_justificativa: i.exigeJustificativa,
    motivo: i.motivo,
    alertas: i.alertas,
  })),
  avisos: s.avisos,
});

const objeto = (j: Json | undefined): Record<string, Json> => (j !== null && typeof j === "object" && !Array.isArray(j) ? j : {});

const FUNCOES: Record<string, (r: Registro) => Json> = {
  "sugestoes.sugerir": (r) => {
    const [linhas, vinculos, tipo, versao, inicio, fim] = r.args;
    const max = objeto(r.kwargs.$opcoes).maxComparacoes;
    return comoPy(
      sugerir(
        linhas as unknown as LinhaParaSugestao[],
        vinculos as unknown as VinculoParaSugestao[],
        tipo as TipoComparacao,
        versao as number,
        String(inicio),
        String(fim),
        typeof max === "number" ? { maxComparacoes: max } : {},
      ),
    );
  },
  "sugestoes.identidade": (r) => identidade(r.args[0] as unknown as LinhaParaSugestao, r.args[1] as unknown as LinhaParaSugestao),
  "sugestoes.normalizar": (r) => normalizar(String(r.args[0])),
};

const todos = readdirSync(PASTA)
  .filter((n) => /^sugestoes-chamadas-\d+\.json$/.test(n))
  .flatMap((n) => registros(n));

describe("sugerir × sugerir", () => {
  it("o gabarito cobre a suíte e cada ramo", () => {
    const chamadas = todos.filter((r) => r.fn === "sugestoes.sugerir");
    expect(chamadas.length).toBeGreaterThanOrEqual(400);
    const criterios = new Set(chamadas.flatMap((r) => ((objeto(r.result).items as Json[]) ?? []).map((i) => objeto(i).criterio)));
    for (const c of ["DOCUMENTO_FAVORECIDO", "FAVORECIDO", "FAVORECIDO_NO_HISTORICO", "PARCELAS_IGUAIS_SOMA_EXATA", "SOMA_GLOBAL_SISPAG", "SOMA_UNICA_SISPAG"]) {
      expect(criterios.has(c), c).toBe(true);
    }
    expect(chamadas.some((r) => ((objeto(r.result).avisos as Json[]) ?? []).length > 0)).toBe(true);
  });

  todos.forEach((r, i) => {
    it(`${r.fn} #${i} ${r.fn === "sugestoes.sugerir" ? `${String(r.args[2])} ${(r.args[0] as Json[]).length} linhas` : JSON.stringify(r.args).slice(0, 60)}`, () => {
      const fn = FUNCOES[r.fn];
      expect(fn, r.fn).toBeDefined();
      expect(executar(() => fn(r))).toEqual(esperado(r));
    });
  });
});
