import { describe, it, expect } from "vitest";
import {
  AGENT_CATALOG,
  agenteDoCatalogo,
  agentesDoSetor,
  modeloDaFaixa,
  modeloParaChamada,
  configEfetiva,
} from "./catalogo";
import { temPrecoConhecido } from "./custo";
import { FERRAMENTAS } from "./ferramentas";
import { registrarTodasAsFerramentas } from "./registro";

describe("AGENT_CATALOG", () => {
  it("não tem código repetido", () => {
    const codes = AGENT_CATALOG.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  // A regra do arquivo: o agente lê e propõe, uma pessoa confirma. Se um dia
  // algum precisar escrever sozinho, que seja uma decisão que quebra um teste.
  it("nenhum agente escreve sozinho", () => {
    expect(AGENT_CATALOG.filter((a) => a.escreve)).toHaveLength(0);
  });

  // Vale mais que contar: nome liberado que não existe no registro vira um
  // agente que tenta usar a ferramenta e leva recusa em produção — e o sintoma
  // é um modelo que "resolveu não consultar nada".
  it("toda ferramenta liberada existe no registro", () => {
    registrarTodasAsFerramentas();
    for (const a of AGENT_CATALOG) {
      for (const nome of a.ferramentas) {
        expect(FERRAMENTAS[nome], `${a.code} libera "${nome}", que não existe`).toBeDefined();
      }
    }
  });

  // A regra que a Onda 2 tornou estrutural: quem grava é a server action que o
  // recrutador dispara, nunca o agente.
  it("agente com ferramenta de escrita não é agente que escreve", () => {
    registrarTodasAsFerramentas();
    for (const a of AGENT_CATALOG) {
      const temEscrita = a.ferramentas.some((n) => FERRAMENTAS[n]?.def.natureza === "escrita");
      if (temEscrita) expect(a.escreve).toBe(false);
    }
  });

  it("todo agente tem os dois tetos, e positivos", () => {
    for (const a of AGENT_CATALOG) {
      expect(a.tetoMensalCentavos).toBeGreaterThan(0);
      expect(a.tetoMensalChamadas).toBeGreaterThan(0);
    }
  });

  it("acha por código, e devolve nulo para o que não existe", () => {
    expect(agenteDoCatalogo("triagem_curriculo")?.label).toBe("Triagem de currículo");
    expect(agenteDoCatalogo("nao_existe")).toBeNull();
  });

  it("lista por setor, inclusive os que servem o app inteiro", () => {
    expect(agentesDoSetor("recrutamento").map((a) => a.code)).toEqual([
      "triagem_curriculo",
      "assistente_de_vaga",
      "atendente_de_candidato",
    ]);
    expect(agentesDoSetor("atendimento").map((a) => a.code)).toEqual([
      "avaliacao_escrita",
      "resumo_agente",
    ]);
    expect(agentesDoSetor(null).map((a) => a.code)).toEqual(["resumo_empresa"]);
  });
});

describe("modelo", () => {
  it("cada faixa tem modelo nos dois provedores", () => {
    for (const faixa of ["rapido", "padrao", "complexo"] as const) {
      expect(modeloDaFaixa("ANTHROPIC", faixa)).toBeTruthy();
      expect(modeloDaFaixa("OPENAI", faixa)).toBeTruthy();
    }
  });

  // O teto em reais só protege se o modelo escolhido pelo catálogo estiver na
  // tabela de preço. Override de cliente pode sair dela — o padrão, não.
  it("todo modelo do catálogo tem preço conhecido", () => {
    for (const faixa of ["rapido", "padrao", "complexo"] as const) {
      expect(temPrecoConhecido(modeloDaFaixa("ANTHROPIC", faixa))).toBe(true);
      expect(temPrecoConhecido(modeloDaFaixa("OPENAI", faixa))).toBe(true);
    }
  });

  it("override do cliente ganha da faixa", () => {
    const def = agenteDoCatalogo("triagem_curriculo")!;
    expect(modeloParaChamada(def, "ANTHROPIC", "claude-opus-5")).toBe("claude-opus-5");
  });

  it("override em branco não conta como escolha", () => {
    const def = agenteDoCatalogo("triagem_curriculo")!;
    const padrao = modeloDaFaixa("ANTHROPIC", def.faixa);
    expect(modeloParaChamada(def, "ANTHROPIC", "   ")).toBe(padrao);
    expect(modeloParaChamada(def, "ANTHROPIC", null)).toBe(padrao);
    expect(modeloParaChamada(def, "ANTHROPIC", undefined)).toBe(padrao);
  });
});

describe("configEfetiva", () => {
  const def = agenteDoCatalogo("triagem_curriculo")!;

  // É o que faz a fundação nascer sem exigir uma linha por cliente por agente
  // antes de qualquer coisa funcionar — e sem desligar o que já roda.
  it("sem linha do cliente, vale o catálogo inteiro", () => {
    const c = configEfetiva(def, null);
    expect(c.enabled).toBe(def.padraoLigado);
    expect(c.tetoMensalCentavos).toBe(def.tetoMensalCentavos);
    expect(c.tetoMensalChamadas).toBe(def.tetoMensalChamadas);
    expect(c.model).toBeNull();
  });

  it("o cliente pode desligar um agente que nasce ligado", () => {
    const c = configEfetiva(def, {
      enabled: false,
      model: null,
      monthlyCapCents: null,
      monthlyCapCalls: null,
    });
    expect(c.enabled).toBe(false);
    // Desligar não mexe nos tetos: eles voltam a valer quando religar.
    expect(c.tetoMensalCentavos).toBe(def.tetoMensalCentavos);
  });

  // Zero é teto, e teto zero é "não gaste nada" — não "use o padrão". `??`
  // preserva isso; `||` teria trocado por silêncio.
  it("teto zero do cliente vale zero", () => {
    const c = configEfetiva(def, {
      enabled: true,
      model: null,
      monthlyCapCents: 0,
      monthlyCapCalls: 0,
    });
    expect(c.tetoMensalCentavos).toBe(0);
    expect(c.tetoMensalChamadas).toBe(0);
  });

  // Os quatro anteriores à fundação nascem ligados, porque desligá-los tiraria
  // do ar função em uso. Agente novo nasce desligado — a regra é a data, não o
  // gosto de quem escreve o catálogo.
  it("o que já rodava nasce ligado; o que é novo, desligado", () => {
    const ligados = AGENT_CATALOG.filter((a) => configEfetiva(a, null).enabled).map((a) => a.code);
    expect(ligados.sort()).toEqual(
      ["avaliacao_escrita", "resumo_agente", "resumo_empresa", "triagem_curriculo"].sort()
    );
    expect(configEfetiva(agenteDoCatalogo("assistente_de_vaga")!, null).enabled).toBe(false);
    expect(configEfetiva(agenteDoCatalogo("atendente_de_candidato")!, null).enabled).toBe(false);
  });
});
