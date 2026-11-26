// A fundação de IA falsa dos testes do ConcilPro: as mesmas regras da OpenAI falsa do plugin
// (scripts/contabil-core/gabarito_concilpro.py) e a conferência das chamadas do porte contra as do original.

import { expect } from "vitest";
import type { DependenciasDaIa } from "../../ia/leituraPorIa";
import { AGENTE_CLASSIFICACAO, AGENTE_IMAGEM, AGENTE_TEXTO, TEXTO_SO_DAS_IMAGENS } from "../ia";
import { PROMPTS, type ChamadaIa, type Regra } from "./ler";

export type Feita = ChamadaIa & { timeoutMs: number };

const TIPO_DO_AGENTE: Record<string, ChamadaIa["tipo"]> = {
  [AGENTE_TEXTO]: "texto",
  [AGENTE_IMAGEM]: "visao",
  [AGENTE_CLASSIFICACAO]: "classificacao",
};
const PADRAO_DA_RESPOSTA = { texto: '{"lancamentos": []}', visao: '{"lancamentos": []}', classificacao: '{"resultados": []}' };

/** A fundação de IA falsa: as mesmas regras da OpenAI falsa do plugin. */
export function iaSimulada(chave: boolean, regrasDoCenario: readonly Regra[]): { ia: DependenciasDaIa; feitas: Feita[] } {
  const regras = regrasDoCenario.map((r) => ({ ...r }));
  const feitas: Feita[] = [];
  const ia: DependenciasDaIa = {
    isAiConfigured: async () => chave,
    gerarTexto: async (p) => {
      const tipo = TIPO_DO_AGENTE[p.agentCode];
      const sistema = (Object.keys(PROMPTS) as (keyof typeof PROMPTS)[]).find((k) => PROMPTS[k] === p.sistema)!;
      // O lote sem o texto do bloco leva a linha fixa (a fundação exige texto); no original, nenhum texto.
      const texto = tipo === "visao" && p.texto === TEXTO_SO_DAS_IMAGENS ? null : p.texto;
      const anexos = p.anexos ?? [];
      const feita: Feita = {
        tipo,
        modelo: p.agentCode,
        sistema,
        texto,
        imagens: anexos.length,
        max_tokens: p.maxTokens,
        timeout: null,
        timeoutMs: p.timeoutMs!,
      };
      if (tipo === "visao") feita.paginas = anexos.map((a) => Number(/pagina-(\d+)\.pdf/.exec(a.nome)![1]) - 1);
      feitas.push(feita);
      const alvo = texto ?? "";
      let conteudo = PADRAO_DA_RESPOSTA[tipo];
      for (const [k, r] of regras.entries()) {
        if (r.tipo !== null && r.tipo !== tipo) continue;
        if (r.se !== null && !alvo.includes(r.se)) continue;
        if (r.uma_vez) regras.splice(k, 1);
        if (r.falha) throw new Error("falha simulada do provedor");
        conteudo = r.content;
        break;
      }
      return conteudo;
    },
  };
  return { ia, feitas };
}

/** As chamadas do porte contra as do original: tipo, agente, sistema, texto, páginas, `max_tokens` e prazo. */
export function conferirChamadas(feitas: readonly Feita[], doOriginal: readonly ChamadaIa[]) {
  expect(feitas.map((f) => f.tipo)).toEqual(doOriginal.map((c) => c.tipo));
  feitas.forEach((f, k) => {
    const o = doOriginal[k];
    expect(f.sistema).toBe(o.sistema);
    expect(f.texto).toBe(o.texto);
    expect(f.imagens).toBe(o.imagens);
    if (o.tipo === "visao") expect(f.paginas).toEqual(o.paginas);
    expect(f.max_tokens).toBe(o.max_tokens);
    // O original não tinha `timeout` na classificação (vale o padrão do cliente da OpenAI, 600 s).
    expect(f.timeoutMs).toBe((o.timeout ?? 600) * 1000);
    expect(o.modelo).toBe({ texto: "gpt-4o-mini", visao: "gpt-4o", classificacao: "gpt-4o-mini" }[o.tipo]);
    expect(f.modelo).toBe({ texto: AGENTE_TEXTO, visao: AGENTE_IMAGEM, classificacao: AGENTE_CLASSIFICACAO }[o.tipo]);
  });
}

