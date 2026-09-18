import { describe, it, expect } from "vitest";
import {
  responderViabilidade,
  pendentesDeConferencia,
  escolherSublote,
  PERGUNTAS,
  TOTAL_CONHECIDO,
  type FatosDaViabilidade,
  type RespostaDaViabilidade,
} from "./viabilidade";

/** O caso mais comum do escritório: contabilidade que não exerce no endereço. */
const ESCRITORIO: FatosDaViabilidade = {
  exercidaNoLocal: false,
  ehComercio: false,
  podeSerOnline: false,
  socioNoMesmoEndereco: false,
  areaGrande: false,
};

function resposta(fatos: FatosDaViabilidade, id: string): RespostaDaViabilidade {
  const r = responderViabilidade(fatos).find((x) => x.id === id);
  if (!r) throw new Error(`pergunta ${id} não existe`);
  return r;
}

describe("a tabela", () => {
  // Eram 21 na suposição antiga; o levantamento de 15/09 mostrou 26.
  it("tem as 26 perguntas do levantamento", () => {
    expect(TOTAL_CONHECIDO).toBe(26);
    expect(responderViabilidade(ESCRITORIO)).toHaveLength(26);
  });

  it("nenhum id se repete — id repetido sobrescreveria resposta na hora de preencher", () => {
    const ids = PERGUNTAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda resposta diz de onde veio", () => {
    for (const r of responderViabilidade(ESCRITORIO)) expect(r.motivo).toBeTruthy();
  });

  // O setor distinguiu "sempre" de "—" na tabela, e a distinção aparece para
  // quem preenche: uma resposta fixa não se questiona, um padrão se confere.
  it("separa a resposta que nunca muda da que é só o padrão de hoje", () => {
    const r = responderViabilidade(ESCRITORIO);
    expect(r.find((x) => x.id === "kg-glp")?.motivo).toContain("não muda");
    expect(r.find((x) => x.id === "atividade-na-residencia")?.motivo).toBe("resposta padrão do setor");
  });
});

describe("as cinco condições que mudam alguma coisa", () => {
  it("comércio exercido no local liga o estoque", () => {
    expect(resposta(ESCRITORIO, "estoque-no-local").resposta).toBe("Não");
    expect(resposta({ ...ESCRITORIO, ehComercio: true, exercidaNoLocal: true }, "estoque-no-local").resposta).toBe("Sim");
  });

  it("comércio que não é exercido no local não liga o estoque", () => {
    // As duas condições valem juntas: é "comércio exercido no local", não
    // "comércio" nem "exercido no local".
    expect(resposta({ ...ESCRITORIO, ehComercio: true }, "estoque-no-local").resposta).toBe("Não");
    expect(resposta({ ...ESCRITORIO, exercidaNoLocal: true }, "estoque-no-local").resposta).toBe("Não");
  });

  it("atividade exercida no local liga o atendimento ao público", () => {
    expect(resposta(ESCRITORIO, "atendimento-ao-publico").resposta).toBe("Não");
    expect(resposta({ ...ESCRITORIO, exercidaNoLocal: true }, "atendimento-ao-publico").resposta).toBe("Sim");
  });

  it("atividade exercida no local desliga o escritório administrativo exclusivo", () => {
    expect(resposta(ESCRITORIO, "exclusivamente-escritorio").resposta).toBe("Sim");
    expect(resposta({ ...ESCRITORIO, exercidaNoLocal: true }, "exclusivamente-escritorio").resposta).toBe("Não");
  });

  it("atividade que pode ser online liga o endereço só fiscal", () => {
    expect(resposta(ESCRITORIO, "exclusivamente-virtual").resposta).toBe("Não");
    expect(resposta({ ...ESCRITORIO, podeSerOnline: true }, "exclusivamente-virtual").resposta).toBe("Sim");
  });

  it("reside no local segue o endereço do sócio, nos dois sentidos", () => {
    expect(resposta({ ...ESCRITORIO, socioNoMesmoEndereco: true }, "reside-no-local").resposta).toBe("Sim");
    expect(resposta({ ...ESCRITORIO, socioNoMesmoEndereco: false }, "reside-no-local").resposta).toBe("Não");
  });
});

describe("o que o robô se recusa a responder", () => {
  // O Connect não guarda sócio. Chutar aqui é declarar residência ao órgão.
  it("sem o endereço do sócio, reside no local fica nulo e pede gente", () => {
    const r = resposta({ ...ESCRITORIO, socioNoMesmoEndereco: null }, "reside-no-local");
    expect(r.resposta).toBeNull();
    expect(r.conferir).toContain("sócio");
  });

  it("área grande responde o mínimo e manda conferir, em vez de inventar o número", () => {
    const r = resposta({ ...ESCRITORIO, areaGrande: true }, "capacidade-de-publico");
    // "até 20" é teto, não valor: o robô declara o menor e a pessoa decide.
    expect(r.resposta).toBe(3);
    expect(r.conferir).toContain("20");
  });

  it("o pavimento térreo vai para conferência quando a atividade é exercida no local", () => {
    // A regra do setor repete o padrão em vez de descrever a troca.
    expect(resposta(ESCRITORIO, "pavimento-terreo").conferir).toBeUndefined();
    expect(resposta({ ...ESCRITORIO, exercidaNoLocal: true }, "pavimento-terreo").conferir).toContain("Societário");
  });
});

describe("pendentesDeConferencia", () => {
  it("o caso comum sai limpo — lista vazia é a licença para enviar sozinho", () => {
    expect(pendentesDeConferencia(responderViabilidade(ESCRITORIO))).toEqual([]);
  });

  it("junta o que ficou nulo e o que pede olhada", () => {
    const pendentes = pendentesDeConferencia(
      responderViabilidade({ ...ESCRITORIO, socioNoMesmoEndereco: null, areaGrande: true, exercidaNoLocal: true })
    );
    expect(pendentes.map((p) => p.id).sort()).toEqual([
      "capacidade-de-publico",
      "pavimento-terreo",
      "reside-no-local",
    ]);
  });
});

describe("as respostas numéricas", () => {
  it("são número, não texto — o formulário tem campo numérico", () => {
    const r = responderViabilidade(ESCRITORIO);
    expect(r.find((x) => x.id === "litros-inflamaveis")?.resposta).toBe(0);
    expect(r.find((x) => x.id === "kg-glp")?.resposta).toBe(0);
    expect(r.find((x) => x.id === "quantidade-pavimentos")?.resposta).toBe(1);
    expect(r.find((x) => x.id === "capacidade-de-publico")?.resposta).toBe(3);
  });
});

describe("escolherSublote", () => {
  const loja = { indicacaoFiscal: "11-222-333-002", complemento: "LOJA 2", sublote: "002" };
  const base = { indicacaoFiscal: "11-222-333-000", complemento: null, sublote: "000" };

  it("resultado único é o resultado, com ou sem complemento", () => {
    expect(escolherSublote([loja], null)).toBe(loja);
  });

  it("com complemento da empresa, casa o complemento", () => {
    expect(escolherSublote([base, loja], "loja 2")).toBe(loja);
  });

  it("sem complemento, cai no primeiro sublote 000", () => {
    expect(escolherSublote([loja, base], null)).toBe(base);
  });

  it("complemento que não casa cai no 000, e não no primeiro da lista", () => {
    expect(escolherSublote([loja, base], "APTO 91")).toBe(base);
  });

  // Escolher o primeiro da lista poria um imóvel qualquer na viabilidade do
  // cliente — e ninguém saberia, porque a viabilidade sai aprovada do mesmo
  // jeito.
  it("vários resultados sem 000 devolvem nulo em vez de um palpite", () => {
    expect(escolherSublote([loja, { ...loja, sublote: "003", complemento: "LOJA 3" }], null)).toBeNull();
  });

  it("busca vazia devolve nulo", () => {
    expect(escolherSublote([], "LOJA 2")).toBeNull();
  });
});
