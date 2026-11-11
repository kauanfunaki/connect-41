import { describe, expect, it } from "vitest";
import {
  CATALOGO_DE_CARTOES,
  PADRAO_DE_TODOS,
  PADRAO_POR_SETOR,
  QUANTOS_CARTOES,
  TOM,
  TODOS,
  cartoesDisponiveis,
  definicaoDoCartao,
  gravarEscolhas,
  lerEscolhas,
  montarCartaoPronto,
  opcoesDosCartoes,
  ordemDosGrupos,
  padraoDoCodigo,
  podeDefinirPadraoDoSetor,
  resolverCartoes,
  trocarNaPosicao,
  type AmbienteDosCartoes,
  type QuemVeOsCartoes,
} from "./cartoes";
import { METRICAS, type MetricaDaHome } from "./metricas";

// Os cartões coringa do topo do Início (10/11/2026, pedido do Kauan): quem vê
// cada cartão, a resolução dos quatro (pessoa > setor > código, sempre quatro)
// e as regras de tom e de variação que o cartão desenha.

const TODOS_OS_MODULOS = [
  ["bpo_contas_pagar", ["bpo"]],
  ["bpo_contas_receber", ["bpo"]],
  ["bpo_pendencias", ["bpo"]],
  ["bpo_aprovacoes", ["bpo"]],
  ["bpo_conciliacao", ["bpo"]],
  ["fiscal_autorizacoes", ["fiscal"]],
  ["fiscal_documentos", ["fiscal"]],
  ["societario_processos", ["societario"]],
  ["societario_prazos", ["societario"]],
  ["societario_licencas", ["societario"]],
  ["dp_colaboradores", ["dp"]],
  ["recrutamento_vagas", ["recrutamento"]],
  ["tech_certificados", ["tech"]],
  ["tech_controle_interno", ["tech"]],
  ["comercial_leads", ["comercial"]],
  ["portal_solicitacoes", ["controladoria"]],
] as const;

function ambiente(
  sobra: Partial<{ desligados: string[]; helpdesk: boolean; setores: string[] }> = {}
): AmbienteDosCartoes {
  const desligados = new Set(sobra.desligados ?? []);
  return {
    modulos: new Map(TODOS_OS_MODULOS.map(([codigo, setores]) => [codigo, { ligado: !desligados.has(codigo), setores }])),
    setores: new Set(sobra.setores ?? ["bpo", "fiscal", "contabil", "societario", "dp", "recrutamento", "tech", "comercial", "controladoria"]),
    helpdesk: { ligado: sobra.helpdesk ?? true, setor: "tech" },
  };
}

const quem = (q: Partial<QuemVeOsCartoes> = {}): QuemVeOsCartoes => ({
  userId: "u1",
  role: "SECTOR_USER",
  sectors: [],
  activeSector: null,
  subscriptionReadOnly: false,
  ...q,
});

const chavesQueVe = (q: QuemVeOsCartoes, amb = ambiente()) => cartoesDisponiveis(q, amb).map((d) => d.chave);

describe("catálogo", () => {
  it("cada chave é uma métrica do histórico, aparece uma vez e cabe na coluna (40 letras)", () => {
    const chaves = CATALOGO_DE_CARTOES.map((d) => d.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const c of chaves) {
      expect(METRICAS[c], c).toBeDefined();
      expect(c.length).toBeLessThanOrEqual(40);
    }
  });

  it("todo padrão de setor tem quatro cartões do catálogo, sem repetir", () => {
    for (const [setor, padrao] of [[TODOS, PADRAO_DE_TODOS], ...Object.entries(PADRAO_POR_SETOR)] as const) {
      expect(padrao, setor).toHaveLength(QUANTOS_CARTOES);
      expect(new Set(padrao).size, setor).toBe(QUANTOS_CARTOES);
      for (const c of padrao) expect(definicaoDoCartao(c), `${setor}: ${c}`).not.toBeNull();
    }
  });

  it("o padrão de \"Todos os setores\" é tarefas, transferências, solicitações atrasadas e empresas ativas", () => {
    expect(padraoDoCodigo(null)).toEqual(["tarefas_atrasadas_hoje", "transferencias_setor", "solicitacoes_atrasadas", "empresas_ativas"]);
    // Setor sem padrão próprio (Financeiro, Gestão) fica com o de todos.
    expect(padraoDoCodigo("gestao")).toEqual(PADRAO_DE_TODOS);
    expect(padraoDoCodigo("bpo")).toEqual(PADRAO_POR_SETOR.bpo);
  });

  it("todo endereço é uma tela do app, e a fila de solicitações leva o setor ativo", () => {
    const amb = ambiente();
    for (const d of CATALOGO_DE_CARTOES) expect(d.href(quem(), amb), d.chave).toMatch(/^\/[a-z]/);
    const atrasadas = definicaoDoCartao("solicitacoes_atrasadas")!;
    expect(atrasadas.href(quem(), amb)).toBe("/solicitacoes?atrasadas=1");
    expect(atrasadas.href(quem({ activeSector: "bpo", sectors: ["bpo"] }), amb)).toBe("/solicitacoes?setor=bpo&atrasadas=1");
    expect(definicaoDoCartao("solicitacoes_minhas")!.href(quem(), amb)).toBe("/solicitacoes?recorte=minhas");
  });
});

describe("quem vê cada cartão", () => {
  it("colaborador do BPO vê os do BPO e os de todos, e nada do DP", () => {
    const ve = chavesQueVe(quem({ sectors: ["bpo"], activeSector: "bpo" }));
    expect(ve).toEqual(expect.arrayContaining([...PADRAO_POR_SETOR.bpo]));
    expect(ve).toContain("tarefas_atrasadas_hoje");
    expect(ve).not.toContain("ferias_vencidas");
    expect(ve).not.toContain("obrigacoes_risco_fiscal");
  });

  it("tela de \"agir\" pede canActOnSector: o leitor (READONLY) vê pendências, mas não as contas a pagar", () => {
    const ve = chavesQueVe(quem({ role: "READONLY" }));
    expect(ve).toContain("pendencias_cliente");
    expect(ve).not.toContain("contas_pagar_vencidas");
    expect(ve).not.toContain("processos_estourados");
  });

  it("módulo desligado no escritório tira o cartão, até do administrador", () => {
    const amb = ambiente({ desligados: ["bpo_conciliacao", "portal_solicitacoes"] });
    const ve = chavesQueVe(quem({ role: "ADMIN" }), amb);
    expect(ve).not.toContain("linhas_a_conciliar");
    expect(ve).not.toContain("solicitacoes_atrasadas");
    expect(ve).toContain("contas_pagar_vencidas");
  });

  it("módulo movido de setor segue o setor novo do escritório", () => {
    const amb = ambiente();
    (amb.modulos as Map<string, { ligado: boolean; setores: readonly string[] }>).set("tech_certificados", { ligado: true, setores: ["societario"] });
    expect(chavesQueVe(quem({ sectors: ["societario"] }), amb)).toContain("certificados_renovar");
    expect(chavesQueVe(quem({ sectors: ["tech"] }), amb)).not.toContain("certificados_renovar");
  });

  it("cartão de setor sem módulo pede o setor existindo no escritório", () => {
    expect(chavesQueVe(quem({ sectors: ["fiscal"] }))).toContain("tarefas_atrasadas_fiscal");
    expect(chavesQueVe(quem({ sectors: ["fiscal"] }), ambiente({ setores: ["bpo"] }))).not.toContain("tarefas_atrasadas_fiscal");
  });

  it("a fila inteira dos chamados é da equipe do setor responsável e do admin; quem abre vê só os seus", () => {
    const deFora = chavesQueVe(quem({ sectors: ["bpo"] }));
    expect(deFora).toContain("chamados_que_abri");
    expect(deFora).not.toContain("chamados_na_fila");
    expect(chavesQueVe(quem({ sectors: ["tech"] }))).toContain("chamados_na_fila");
    expect(chavesQueVe(quem({ role: "ADMIN" }))).toContain("chamados_atrasados");
    expect(chavesQueVe(quem({ role: "ADMIN" }), ambiente({ helpdesk: false }))).not.toContain("chamados_que_abri");
  });

  it("sem caixa de setor (sem setor e sem visão geral), o cartão de transferências para o setor não existe", () => {
    expect(chavesQueVe(quem({ sectors: [] }))).not.toContain("transferencias_setor");
    expect(chavesQueVe(quem({ sectors: ["bpo"] }))).toContain("transferencias_setor");
    expect(chavesQueVe(quem({ role: "ADMIN" }))).toContain("transferencias_setor");
  });
});

describe("resolverCartoes", () => {
  const todos = CATALOGO_DE_CARTOES.map((d) => d.chave);
  const chaves = (r: ReturnType<typeof resolverCartoes>) => r.map((c) => c?.chave ?? null);

  it("sem escolha nenhuma, o padrão do código do setor ativo", () => {
    const r = resolverCartoes({ pessoa: null, setor: null, setorAtivo: "bpo", disponiveis: todos });
    expect(chaves(r)).toEqual([...PADRAO_POR_SETOR.bpo]);
    expect(r.every((c) => c?.origem === "padrao" && !c.daPessoa)).toBe(true);
  });

  it("o padrão do setor vale mais que o do código, e a escolha da pessoa vale mais que os dois", () => {
    const setor: (MetricaDaHome | null)[] = ["linhas_a_conciliar", null, null, "contas_receber_vencidas"];
    const pessoa: (MetricaDaHome | null)[] = [null, "empresas_ativas", null, null];
    const r = resolverCartoes({ pessoa, setor, setorAtivo: "bpo", disponiveis: todos });
    expect(chaves(r)).toEqual(["linhas_a_conciliar", "empresas_ativas", "pendencias_cliente", "contas_receber_vencidas"]);
    expect(r.map((c) => c?.origem)).toEqual(["setor", "pessoa", "padrao", "setor"]);
    expect(r.map((c) => c?.daPessoa)).toEqual([false, true, false, false]);
  });

  it("cartão que a pessoa não vê cai para o de baixo na mesma posição, e o \"Voltar\" continua oferecido", () => {
    const disponiveis = todos.filter((c) => c !== "ferias_vencidas");
    const r = resolverCartoes({ pessoa: ["ferias_vencidas", null, null, null], setor: null, setorAtivo: "bpo", disponiveis });
    expect(r[0]).toEqual({ chave: "contas_pagar_vencidas", origem: "padrao", daPessoa: true });
  });

  it("sempre quatro: o que sobra vazio vem do próximo padrão que a pessoa vê", () => {
    // Do padrão do Fiscal ela só vê as tarefas; o resto sai do padrão de todos.
    const disponiveis: MetricaDaHome[] = ["tarefas_atrasadas_fiscal", "tarefas_atrasadas_hoje", "empresas_ativas", "transferencias_enviadas", "xml_recusados"];
    const r = resolverCartoes({ pessoa: null, setor: null, setorAtivo: "fiscal", disponiveis });
    expect(chaves(r)).toEqual(["tarefas_atrasadas_hoje", "empresas_ativas", "xml_recusados", "tarefas_atrasadas_fiscal"]);
    expect(new Set(chaves(r)).size).toBe(QUANTOS_CARTOES);
  });

  it("com menos de quatro indicadores, menos cartões — e nunca repetido", () => {
    const r = resolverCartoes({ pessoa: null, setor: null, setorAtivo: null, disponiveis: ["empresas_ativas", "tarefas_atrasadas_hoje"] });
    expect(chaves(r).filter(Boolean).sort()).toEqual(["empresas_ativas", "tarefas_atrasadas_hoje"]);
    expect(r.filter((c) => c === null)).toHaveLength(2);
  });

  it("o mesmo cartão em duas posições: fica o da pessoa, e a posição do setor recebe outro", () => {
    const r = resolverCartoes({
      pessoa: [null, null, "contas_pagar_vencidas", null],
      setor: null,
      setorAtivo: "bpo",
      disponiveis: todos,
    });
    expect(r[2]?.chave).toBe("contas_pagar_vencidas");
    expect(r[0]?.chave).not.toBe("contas_pagar_vencidas");
    expect(new Set(chaves(r)).size).toBe(QUANTOS_CARTOES);
  });
});

describe("escolhas gravadas", () => {
  it("lê as quatro posições e troca chave desconhecida por vazio sem mexer nas outras", () => {
    expect(lerEscolhas(JSON.stringify(["empresas_ativas", "cartao_que_saiu", null, "leads_novos"]))).toEqual([
      "empresas_ativas",
      null,
      null,
      "leads_novos",
    ]);
  });

  it("JSON quebrado, formato errado ou nada escolhido: sem escolha", () => {
    expect(lerEscolhas(null)).toBeNull();
    expect(lerEscolhas("{quebrado")).toBeNull();
    expect(lerEscolhas(JSON.stringify({ a: 1 }))).toBeNull();
    expect(lerEscolhas(JSON.stringify([null, "x", 3]))).toBeNull();
  });

  it("gravar sem escolha nenhuma apaga a linha (null); com escolha, as quatro posições", () => {
    expect(gravarEscolhas([null, null, null, null])).toBeNull();
    expect(gravarEscolhas([null, "empresas_ativas"])).toBe(JSON.stringify([null, "empresas_ativas", null, null]));
  });

  it("trocar põe a chave na posição; se ela já aparece em outra, as duas trocam de lugar", () => {
    const mostrados: MetricaDaHome[] = ["tarefas_atrasadas_hoje", "transferencias_setor", "solicitacoes_atrasadas", "empresas_ativas"];
    expect(trocarNaPosicao(null, 1, "leads_novos", mostrados)).toEqual([null, "leads_novos", null, null]);
    expect(trocarNaPosicao(null, 0, "empresas_ativas", mostrados)).toEqual(["empresas_ativas", null, null, "tarefas_atrasadas_hoje"]);
  });
});

describe("padrão do setor: quem grava", () => {
  it("quem coordena o setor ativo, o admin e o super admin", () => {
    expect(podeDefinirPadraoDoSetor(quem({ role: "SECTOR_ADMIN", sectors: ["bpo"], activeSector: "bpo" }))).toBe(true);
    expect(podeDefinirPadraoDoSetor(quem({ role: "ADMIN", activeSector: "fiscal" }))).toBe(true);
    expect(podeDefinirPadraoDoSetor(quem({ role: "SUPER_ADMIN", activeSector: "dp" }))).toBe(true);
  });

  it("não: coordenador de outro setor, colaborador, leitor, sem setor ativo ou assinatura só leitura", () => {
    expect(podeDefinirPadraoDoSetor(quem({ role: "SECTOR_ADMIN", sectors: ["bpo"], activeSector: "fiscal" }))).toBe(false);
    expect(podeDefinirPadraoDoSetor(quem({ role: "SECTOR_USER", sectors: ["bpo"], activeSector: "bpo" }))).toBe(false);
    expect(podeDefinirPadraoDoSetor(quem({ role: "READONLY", activeSector: "bpo" }))).toBe(false);
    expect(podeDefinirPadraoDoSetor(quem({ role: "ADMIN", activeSector: null }))).toBe(false);
    expect(podeDefinirPadraoDoSetor(quem({ role: "ADMIN", activeSector: "bpo", subscriptionReadOnly: true }))).toBe(false);
  });
});

describe("tom do cartão: a cor só no que pede atenção", () => {
  it("as regras", () => {
    expect(TOM.criticoSePositivo({ valor: 0 })).toBeNull();
    expect(TOM.criticoSePositivo({ valor: 2 })).toBe("critico");
    expect(TOM.atencaoSePositivo({ valor: 1 })).toBe("atencao");
    expect(TOM.criticoSeAlertaSenaoAtencao({ valor: 4, alerta: 1 })).toBe("critico");
    expect(TOM.criticoSeAlertaSenaoAtencao({ valor: 4, alerta: 0 })).toBe("atencao");
    expect(TOM.criticoSeAlertaSenaoAtencao({ valor: 0 })).toBeNull();
    expect(TOM.criticoSePositivoSenaoAtencaoSeAlerta({ valor: 0, alerta: 3 })).toBe("atencao");
    expect(TOM.criticoSePositivoSenaoAtencaoSeAlerta({ valor: 1, alerta: 3 })).toBe("critico");
  });

  it("tarefas: vermelho com atrasada, âmbar só com as de hoje — como o painel", () => {
    const tarefas = definicaoDoCartao("tarefas_atrasadas_hoje")!;
    expect(tarefas.tom({ valor: 5, alerta: 2 })).toBe("critico");
    expect(tarefas.tom({ valor: 3, alerta: 0 })).toBe("atencao");
    expect(definicaoDoCartao("empresas_ativas")!.tom({ valor: 394 })).toBeNull();
  });
});

describe("montarCartaoPronto", () => {
  const amb = ambiente();
  const hojeKey = "2026-11-10";
  const def = definicaoDoCartao("tarefas_atrasadas_hoje")!;

  it("número, tom, variação desde ontem e a linha das duas semanas", () => {
    const fotos = [
      { dia: "2026-11-06", valor: 9 },
      { dia: "2026-11-08", valor: 8 },
      { dia: "2026-11-09", valor: 8 },
    ];
    const c = montarCartaoPronto({ def, numero: { valor: 7, alerta: 7 }, fotos, hojeKey, quem: quem(), amb });
    expect(c.numero).toEqual({ texto: "7", tom: "critico" });
    expect(c.variacao).toMatchObject({ direcao: "caiu", texto: "−1 desde ontem", tom: "bom" });
    expect(c.linha).toHaveLength(4);
    expect(c.href).toBe("/kanban");
  });

  it("cartão novo: sem foto, sem variação e sem linha (a tela diz \"sem histórico ainda\")", () => {
    const c = montarCartaoPronto({ def, numero: { valor: 3 }, fotos: [], hojeKey, quem: quem(), amb });
    expect(c.variacao).toBeNull();
    expect(c.linha).toBeNull();
    expect(c.numero?.texto).toBe("3");
  });

  it("consulta que falhou: sem número (a tela oferece tentar de novo)", () => {
    const c = montarCartaoPronto({ def, numero: null, fotos: null, hojeKey, quem: quem(), amb });
    expect(c.numero).toBeNull();
  });

  it("a fração leva o total ao lado", () => {
    const funil = definicaoDoCartao("conversao_funil")!;
    const c = montarCartaoPronto({ def: funil, numero: { valor: 18, total: 42 }, fotos: null, hojeKey, quem: quem(), amb });
    expect(c.numero).toEqual({ texto: "18", apoio: "de 42", tom: null });
  });

  it("o cartão da Academia (Fase 2): a sequência, o apoio e a linha de baixo, sem cor", () => {
    const academia = definicaoDoCartao("academia_desafio_do_dia")!;
    const c = montarCartaoPronto({
      def: academia, numero: { valor: 3, apoio: "dias seguidos", detalhe: "Desafio de hoje feito" }, fotos: null, hojeKey, quem: quem(), amb,
    });
    expect(c.numero).toEqual({ texto: "3", apoio: "dias seguidos", detalhe: "Desafio de hoje feito", tom: null });
    expect(c.href).toBe("/academia/desafio");
  });
});

describe("o cartão da Academia (Fase 2)", () => {
  it("aparece para qualquer setor e perfil, só com o módulo ligado, e fora de todo padrão", () => {
    const comAcademia: AmbienteDosCartoes = { ...ambiente(), modulos: new Map([...ambiente().modulos, ["academia", { ligado: true, setores: ["tech"] }]]) };
    expect(chavesQueVe(quem({ sectors: ["fiscal"], role: "READONLY" }), comAcademia)).toContain("academia_desafio_do_dia");
    expect(chavesQueVe(quem({ sectors: ["fiscal"] }))).not.toContain("academia_desafio_do_dia");
    const padroes = [PADRAO_DE_TODOS, ...Object.values(PADRAO_POR_SETOR)].flat();
    expect(padroes).not.toContain("academia_desafio_do_dia");
  });
});

describe("lista do lápis", () => {
  it("setor ativo primeiro, depois os outros na ordem do escritório e \"Todos os setores\" por último", () => {
    expect(ordemDosGrupos("contabil", ["bpo", "fiscal", "contabil"])).toEqual(["contabil", "bpo", "fiscal", TODOS]);
    const setores = [
      { code: "bpo", label: "BPO" },
      { code: "fiscal", label: "Fiscal" },
    ];
    const q = quem({ sectors: ["bpo", "fiscal"], activeSector: "fiscal" });
    const opcoes = opcoesDosCartoes(cartoesDisponiveis(q, amb()), q, amb(), setores);
    const grupos = [...new Set(opcoes.map((o) => o.grupoRotulo))];
    expect(grupos[0]).toBe("Fiscal");
    expect(grupos[1]).toBe("BPO");
    expect(grupos[grupos.length - 1]).toBe("Todos os setores");
    expect(opcoes.every((o) => o.href.startsWith("/"))).toBe(true);
  });

  function amb() {
    return ambiente();
  }
});
