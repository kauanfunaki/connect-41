import { describe, it, expect, afterEach } from "vitest";
import {
  FERRAMENTAS,
  ferramentaPara,
  podeUsarFerramenta,
  ferramentasDoAgente,
  AVISO_DE_PROPOSTA,
  type FerramentaRegistrada,
} from "./ferramentas";
import { agenteDoCatalogo, type AgenteDef } from "./catalogo";

function agente(over: Partial<AgenteDef> = {}): AgenteDef {
  return {
    code: "teste",
    label: "Teste",
    sectorCode: null,
    description: "",
    faixa: "padrao",
    escreve: false,
    ferramentas: [],
    tetoMensalCentavos: 1_000,
    tetoMensalChamadas: 100,
    padraoLigado: false,
    ...over,
  };
}

function registrar(nome: string, natureza: "leitura" | "escrita") {
  const reg: FerramentaRegistrada = {
    def: { nome, descricao: "só para teste", parametros: { type: "object" }, natureza },
    ...(natureza === "leitura" ? { executar: async () => ({ ok: true }) } : {}),
  };
  FERRAMENTAS[nome] = reg;
  return reg;
}

afterEach(() => {
  for (const k of Object.keys(FERRAMENTAS)) delete FERRAMENTAS[k];
});

describe("registro", () => {
  // Vazio de propósito: declarar aqui é prometer que a ferramenta existe e foi
  // revisada, e o primeiro consumidor real é o piloto do Recrutamento.
  it("nasce vazio", () => {
    expect(Object.keys(FERRAMENTAS)).toHaveLength(0);
    expect(ferramentaPara("qualquer")).toBeNull();
  });

  it("nenhum agente do catálogo declara ferramenta ainda", () => {
    for (const code of ["triagem_curriculo", "resumo_empresa", "avaliacao_escrita", "resumo_agente"]) {
      expect(agenteDoCatalogo(code)!.ferramentas).toHaveLength(0);
    }
  });

  // Ferramenta de escrita não tem executor: não existe caminho para o agente
  // gravar, nem por engano.
  it("ferramenta de escrita não carrega executor", () => {
    const reg = registrar("criar_tarefa", "escrita");
    expect(reg.executar).toBeUndefined();
  });
});

describe("podeUsarFerramenta", () => {
  it("liberada e existente, pode", () => {
    registrar("ler_empresa", "leitura");
    const v = podeUsarFerramenta(agente({ ferramentas: ["ler_empresa"] }), "ler_empresa");
    expect(v.pode).toBe(true);
  });

  // O ponto da allowlist. Modelo inventa nome de ferramenta, e um texto que ele
  // leu pode pedir que invente. Se "existe no registro" bastasse, um agente
  // atravessaria para a ferramenta de outro.
  it("ferramenta de OUTRO agente é recusada, mesmo existindo", () => {
    registrar("ler_folha", "leitura");
    const v = podeUsarFerramenta(agente({ ferramentas: ["ler_empresa"] }), "ler_folha");
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("não está liberada");
  });

  it("nome inventado é recusado", () => {
    const v = podeUsarFerramenta(agente({ ferramentas: [] }), "apagar_tudo");
    expect(v.pode).toBe(false);
  });

  // Liberada no catálogo mas ausente do registro: erro de catálogo, e a recusa
  // precisa dizer que ela não existe, não que falta permissão.
  it("liberada mas inexistente recusa por inexistência", () => {
    const v = podeUsarFerramenta(agente({ ferramentas: ["fantasma"] }), "fantasma");
    expect(v.pode).toBe(false);
    if (!v.pode) expect(v.motivo).toContain("não existe");
  });

  it("agente sem ferramenta nenhuma não pode usar nada", () => {
    registrar("ler_empresa", "leitura");
    expect(podeUsarFerramenta(agente(), "ler_empresa").pode).toBe(false);
  });
});

describe("ferramentasDoAgente", () => {
  it("devolve só as liberadas", () => {
    registrar("a", "leitura");
    registrar("b", "leitura");
    const fs = ferramentasDoAgente(agente({ ferramentas: ["a"] }));
    expect(fs.map((f) => f.nome)).toEqual(["a"]);
  });

  // Derrubar a chamada por causa de um nome errado no catálogo tiraria do ar um
  // agente inteiro por uma ferramenta que ele talvez nem usasse.
  it("ignora nome liberado que não existe, sem quebrar", () => {
    registrar("a", "leitura");
    expect(ferramentasDoAgente(agente({ ferramentas: ["a", "fantasma"] })).map((f) => f.nome)).toEqual(["a"]);
  });

  it("agente sem ferramenta devolve lista vazia", () => {
    expect(ferramentasDoAgente(agente())).toEqual([]);
  });
});

describe("AVISO_DE_PROPOSTA", () => {
  // Um modelo que acredita ter gravado escreve o resumo final como se a coisa
  // estivesse resolvida — e a pessoa lê "pronto, atualizei" ao lado de um botão
  // de confirmar que ninguém apertou.
  it("diz que nada foi gravado, e proíbe afirmar o contrário", () => {
    expect(AVISO_DE_PROPOSTA).toContain("NADA foi gravado");
    expect(AVISO_DE_PROPOSTA.toLowerCase()).toContain("não afirme");
  });
});
