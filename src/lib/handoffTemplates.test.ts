import { describe, it, expect } from "vitest";
import {
  HANDOFF_TEMPLATES,
  TAREFAS_POR_SETOR,
  TAREFA_MAXIMA,
  assuntoParaGravar,
  contatoDoCadastro,
  detalhesParaGravar,
  getHandoffTemplate,
  lerDetalhes,
  matchSectorsForTemplate,
  modelosPorUso,
  setoresDoModelo,
  tarefasParaGravar,
} from "./handoffTemplates";

describe("HANDOFF_TEMPLATES", () => {
  it("tem 16 modelos, todos com key e label únicos", () => {
    expect(HANDOFF_TEMPLATES).toHaveLength(16);
    expect(new Set(HANDOFF_TEMPLATES.map((t) => t.key)).size).toBe(16);
    expect(new Set(HANDOFF_TEMPLATES.map((t) => t.label)).size).toBe(16);
  });

  // O pedido de 16/11/2026 (melhoria-705): "as informações em […] não devem
  // aparecer para os usuários". O que ficava entre colchetes virou campo.
  it("nenhum texto de modelo tem colchete", () => {
    for (const t of HANDOFF_TEMPLATES) {
      const textos = [t.label, ...t.campos.flatMap((c) => [c.rotulo, ...(c.opcoes ?? [])]), ...t.setores.flatMap((s) => s.tarefas)];
      expect(textos.filter((x) => /[[\]]/.test(x))).toEqual([]);
    }
  });

  it("só o genérico deixa os setores para quem pede; os outros 15 marcam setores com tarefas", () => {
    const semSetor = HANDOFF_TEMPLATES.filter((t) => t.setores.length === 0).map((t) => t.key);
    expect(semSetor).toEqual(["SOLICITACAO_MULTISSETORIAL"]);
    for (const t of HANDOFF_TEMPLATES) for (const s of t.setores) expect(s.tarefas.length).toBeGreaterThan(0);
  });

  it("chaves de campo únicas por modelo, opções só no seletor, e toda tarefa cabe na coluna", () => {
    for (const t of HANDOFF_TEMPLATES) {
      expect(new Set(t.campos.map((c) => c.chave)).size).toBe(t.campos.length);
      for (const c of t.campos) expect(Boolean(c.opcoes?.length)).toBe(c.tipo === "opcoes");
      for (const s of t.setores) for (const tarefa of s.tarefas) expect(tarefa.length).toBeLessThanOrEqual(TAREFA_MAXIMA);
    }
  });

  it("getHandoffTemplate encontra pelo key exato", () => {
    expect(getHandoffTemplate("ALTERACAO_CONTRATUAL")?.label).toBe("Alteração contratual");
    expect(getHandoffTemplate("nao-existe")).toBeUndefined();
  });
});

describe("setoresDoModelo e matchSectorsForTemplate", () => {
  const doEscritorio = [
    { value: "fiscal", label: "Fiscal" },
    { value: "contabil", label: "Contábil" },
    { value: "dp", label: "Departamento Pessoal" },
    { value: "societario", label: "Societário" },
    { value: "recrutamento", label: "Recrutamento" },
  ];

  it("marca os setores do modelo na ordem dele, com as tarefas de cada um", () => {
    const setores = setoresDoModelo("REGULARIZACAO_BAIXA", doEscritorio);
    expect(setores.map((s) => s.setor)).toEqual(["fiscal", "contabil", "societario"]);
    expect(setores[0].tarefas[0]).toBe("Identificar as declarações omitidas e os períodos pendentes");
  });

  it("acha o setor pelo nome, sem acento e sem maiúscula, quando o código é outro", () => {
    const outros = [
      { value: "SOC", label: "Societário" },
      { value: "PESSOAL", label: "Depto. Pessoal" },
    ];
    expect(matchSectorsForTemplate("BAIXA_CNPJ", outros)).toEqual(["SOC", "PESSOAL"]);
  });

  it("setor que o escritório não tem fica de fora (o Financeiro do distrato)", () => {
    expect(matchSectorsForTemplate("DISTRATO_VARIAS_EMPRESAS", doEscritorio)).toEqual(["societario", "fiscal", "contabil", "dp"]);
  });

  it("o genérico e a chave desconhecida não marcam nada", () => {
    expect(matchSectorsForTemplate("SOLICITACAO_MULTISSETORIAL", doEscritorio)).toEqual([]);
    expect(setoresDoModelo("INEXISTENTE", doEscritorio)).toEqual([]);
  });
});

describe("tarefasParaGravar", () => {
  it("limpa espaços, tira vazias e repetidas (sem diferença de maiúscula)", () => {
    expect(tarefasParaGravar(["  Conferir   a folha ", "", null, "conferir a folha", "Fechar o mês"])).toEqual(["Conferir a folha", "Fechar o mês"]);
  });

  it("corta no tamanho da coluna e no teto por setor", () => {
    expect(tarefasParaGravar(["a".repeat(400)])[0]).toHaveLength(TAREFA_MAXIMA);
    expect(tarefasParaGravar(Array.from({ length: 50 }, (_, i) => `Tarefa ${i}`))).toHaveLength(TAREFAS_POR_SETOR);
  });
});

describe("detalhesParaGravar", () => {
  it("grava as respostas na ordem do modelo, com o rótulo; o que fica em branco sai", () => {
    expect(detalhesParaGravar("REGULARIZACAO_BAIXA", { depois: "Abrir MEI", situacao: "Inapta", valor: "  R$ 1.800  " })).toEqual([
      { rotulo: "Situação da empresa", valor: "Inapta" },
      { rotulo: "Valor acordado", valor: "R$ 1.800" },
      { rotulo: "Depois da baixa", valor: "Abrir MEI" },
    ]);
  });

  it("em branco, regime e contato vêm do cadastro; preenchido, vale o que a pessoa escreveu", () => {
    const cadastro = { regime: "Simples Nacional", contato: "(41) 3333-0000" };
    expect(detalhesParaGravar("SETUP_MIGRACAO", {}, cadastro)).toEqual([{ rotulo: "Regime tributário", valor: "Simples Nacional" }]);
    expect(detalhesParaGravar("REGULARIZACAO_BAIXA", { contato: "Falar com a Ana" }, cadastro)).toEqual([
      { rotulo: "Contato do cliente", valor: "Falar com a Ana" },
    ]);
  });

  it("opção que não é do seletor é ignorada; a data vira DD/MM/AAAA", () => {
    expect(detalhesParaGravar("INCLUSAO_CNAE", { tipo: "Terciária" })).toEqual([]);
    expect(detalhesParaGravar("ENCERRAMENTO_EMPRESA", { inicio: "2026-11-17", previsao: "17/11" })).toEqual([
      { rotulo: "Data de início", valor: "17/11/2026" },
    ]);
  });

  it("sem modelo não há dados", () => {
    expect(detalhesParaGravar(null, { quemPediu: "Ana" })).toEqual([]);
    expect(detalhesParaGravar("INEXISTENTE", { quemPediu: "Ana" })).toEqual([]);
  });
});

describe("lerDetalhes e contatoDoCadastro", () => {
  it("lê de volta só o que tem a forma certa", () => {
    expect(lerDetalhes([{ rotulo: "A", valor: "1" }, { rotulo: "B" }, "x", null])).toEqual([{ rotulo: "A", valor: "1" }]);
    expect(lerDetalhes(null)).toEqual([]);
  });

  it("junta telefone e e-mail; sem nenhum, null", () => {
    expect(contatoDoCadastro({ phone: "(41) 3333-0000", email: "a@b.com" })).toBe("(41) 3333-0000 · a@b.com");
    expect(contatoDoCadastro({ phone: " ", email: null })).toBeNull();
    expect(contatoDoCadastro(null)).toBeNull();
  });
});

// A ordem dos blocos de assunto e o assunto gravado (10/11/2026).
describe("modelosPorUso", () => {
  it("sem uso nenhum, abre com os seis do desenho escolhido e depois a ordem da lista", () => {
    const ordem = modelosPorUso({}).map((t) => t.key);
    expect(ordem.slice(0, 6)).toEqual([
      "BAIXA_CNPJ",
      "ALTERACAO_CONTRATUAL",
      "ABERTURA_NOVA_EMPRESA",
      "INCLUSAO_CNAE",
      "SETUP_MIGRACAO",
      "REGULARIZACAO_MUNICIPAL_ESTADUAL",
    ]);
    expect(ordem).toHaveLength(16);
    expect(new Set(ordem).size).toBe(16);
  });

  it("o mais usado no escritório vem primeiro; empate segue a ordem padrão", () => {
    const ordem = modelosPorUso({ FECHAMENTO_MENSAL_BPO: 9, INCLUSAO_CNAE: 2, BAIXA_CNPJ: 2 }).map((t) => t.key);
    expect(ordem.slice(0, 3)).toEqual(["FECHAMENTO_MENSAL_BPO", "BAIXA_CNPJ", "INCLUSAO_CNAE"]);
  });
});

describe("assuntoParaGravar", () => {
  it("com um modelo, grava o rótulo dele e a chave — o texto livre não entra", () => {
    expect(assuntoParaGravar("qualquer coisa", "BAIXA_CNPJ")).toEqual({ subject: "Baixa de CNPJ", templateKey: "BAIXA_CNPJ" });
  });

  it("sem modelo, grava o texto de Outro assunto, limpo, sem chave", () => {
    expect(assuntoParaGravar("  Troca do   contador ", "")).toEqual({ subject: "Troca do contador", templateKey: null });
  });

  it("chave que não é modelo vale como sem modelo", () => {
    expect(assuntoParaGravar("Outro", "NAO_EXISTE")).toEqual({ subject: "Outro", templateKey: null });
  });

  it("sem modelo e sem texto não há assunto (é obrigatório)", () => {
    expect(assuntoParaGravar("   ", null)).toBeNull();
    expect(assuntoParaGravar(null, undefined)).toBeNull();
  });

  it("corta no tamanho da coluna", () => {
    expect(assuntoParaGravar("a".repeat(300), null, 160)?.subject).toHaveLength(160);
  });
});
