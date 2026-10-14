import { describe, expect, it } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import {
  TODAS_AS_TELAS_DO_GERAL,
  alternarTelaOculta,
  gravarTelasOcultas,
  lerTelasOcultas,
  podeConfigurarMenuGeral,
  semTelasDoGeralOcultas,
  setoresQueDecidemOGeral,
  telaDoGeralDoModulo,
  telasDoGeralVisiveis,
  type TelaDoGeral,
} from "./menuGeral";
import { tutorialDaEquipe, type OpcoesDaEquipe } from "./tutorial/tutoriais";

// O que se testa: o menu Geral por setor (14/10/2026). Setor sem configuração
// vê tudo; quem está em mais de um setor vê a união; com setor escolhido, vale
// o dele; administrador em "Todos os setores" vê tudo; o conteúdo da coluna
// nunca derruba o menu; só Administrador e Super Admin configuram.

const TUDO = [...TODAS_AS_TELAS_DO_GERAL];
const sem = (...fora: TelaDoGeral[]) => TUDO.filter((t) => !fora.includes(t));

describe("lerTelasOcultas", () => {
  it("sem configuração, nada escondido", () => {
    expect(lerTelasOcultas(null)).toEqual([]);
    expect(lerTelasOcultas(undefined)).toEqual([]);
    expect(lerTelasOcultas("")).toEqual([]);
  });

  it("JSON quebrado ou que não é lista: nada escondido, sem lançar", () => {
    expect(lerTelasOcultas("{not json")).toEqual([]);
    expect(lerTelasOcultas('{"solicitacoes":true}')).toEqual([]);
    expect(lerTelasOcultas('"solicitacoes"')).toEqual([]);
  });

  it("chave desconhecida, repetida ou que não é texto cai fora; a ordem é a do menu", () => {
    expect(lerTelasOcultas('["agenda","inicio","meu-dia",42,null,"solicitacoes","agenda","conversas"]')).toEqual([
      "solicitacoes",
      "agenda",
    ]);
  });

  it("Início e Meu dia não são telas escondíveis", () => {
    expect(lerTelasOcultas('["inicio","home","tarefas","meu-dia"]')).toEqual([]);
  });
});

describe("gravarTelasOcultas e alternarTelaOculta", () => {
  it("grava só o que existe, sem repetição, na ordem do menu", () => {
    expect(gravarTelasOcultas(["transferencias", "lixo", "solicitacoes", "transferencias"])).toBe('["transferencias","solicitacoes"]');
    expect(gravarTelasOcultas([])).toBe("[]");
  });

  it("esconder acrescenta; mostrar tira; repetir não duplica", () => {
    expect(alternarTelaOculta([], "solicitacoes", false)).toEqual(["solicitacoes"]);
    expect(alternarTelaOculta(["solicitacoes"], "transferencias", false)).toEqual(["transferencias", "solicitacoes"]);
    expect(alternarTelaOculta(["solicitacoes"], "solicitacoes", false)).toEqual(["solicitacoes"]);
    expect(alternarTelaOculta(["transferencias", "solicitacoes"], "solicitacoes", true)).toEqual(["transferencias"]);
    expect(alternarTelaOculta([], "agenda", true)).toEqual([]);
  });
});

describe("setoresQueDecidemOGeral", () => {
  it("com setor escolhido, vale o dele — para qualquer papel", () => {
    expect(setoresQueDecidemOGeral("recrutamento", ["recrutamento", "dp"], false)).toEqual(["recrutamento"]);
    expect(setoresQueDecidemOGeral("recrutamento", [], true)).toEqual(["recrutamento"]);
  });

  it("em Todos os setores, os setores da pessoa", () => {
    expect(setoresQueDecidemOGeral(null, ["recrutamento", "dp"], false)).toEqual(["recrutamento", "dp"]);
  });

  it("administrador em Todos os setores: ninguém recorta", () => {
    expect(setoresQueDecidemOGeral(null, ["bpo"], true)).toBeNull();
    expect(setoresQueDecidemOGeral(null, [], true)).toBeNull();
  });
});

describe("telasDoGeralVisiveis", () => {
  const recrutamentoSemSolicitacoes = { recrutamento: ["solicitacoes", "transferencias"] as TelaDoGeral[] };

  it("sem recorte (null) ou sem setor: todas", () => {
    expect(telasDoGeralVisiveis(null, recrutamentoSemSolicitacoes)).toEqual(TUDO);
    expect(telasDoGeralVisiveis([], recrutamentoSemSolicitacoes)).toEqual(TUDO);
  });

  it("setor sem configuração: todas (o menu de antes)", () => {
    expect(telasDoGeralVisiveis(["dp"], {})).toEqual(TUDO);
    expect(telasDoGeralVisiveis(["dp"], recrutamentoSemSolicitacoes)).toEqual(TUDO);
  });

  it("um setor: o que ele escondeu sai", () => {
    expect(telasDoGeralVisiveis(["recrutamento"], recrutamentoSemSolicitacoes)).toEqual(sem("solicitacoes", "transferencias"));
  });

  it("mais de um setor: a união — some só o que todos esconderam", () => {
    const config = {
      recrutamento: ["solicitacoes", "transferencias"] as TelaDoGeral[],
      comercial: ["transferencias", "agenda"] as TelaDoGeral[],
    };
    expect(telasDoGeralVisiveis(["recrutamento", "comercial"], config)).toEqual(sem("transferencias"));
    // Com um setor sem configuração na conta, tudo volta.
    expect(telasDoGeralVisiveis(["recrutamento", "dp"], config)).toEqual(TUDO);
  });

  it("um setor pode esconder todas — Início e Meu dia não entram nesta conta", () => {
    expect(telasDoGeralVisiveis(["recrutamento"], { recrutamento: TUDO })).toEqual([]);
  });

  it("o caso do Recrutamento, de ponta a ponta", () => {
    const config = { recrutamento: ["solicitacoes", "transferencias"] as TelaDoGeral[] };
    // A recrutadora (um setor só fica sempre nele).
    expect(telasDoGeralVisiveis(setoresQueDecidemOGeral("recrutamento", ["recrutamento"], false), config)).not.toContain(
      "solicitacoes",
    );
    // Quem é do Recrutamento e do DP: em Todos os setores, a soma — vê; dentro do Recrutamento, não vê.
    expect(telasDoGeralVisiveis(setoresQueDecidemOGeral(null, ["recrutamento", "dp"], false), config)).toContain("solicitacoes");
    expect(telasDoGeralVisiveis(setoresQueDecidemOGeral("recrutamento", ["recrutamento", "dp"], false), config)).not.toContain(
      "transferencias",
    );
    // O administrador em Todos vê tudo; dentro do Recrutamento, confere o que o setor vê.
    expect(telasDoGeralVisiveis(setoresQueDecidemOGeral(null, [], true), config)).toEqual(TUDO);
    expect(telasDoGeralVisiveis(setoresQueDecidemOGeral("recrutamento", [], true), config)).toEqual(sem("solicitacoes", "transferencias"));
  });
});

describe("semTelasDoGeralOcultas", () => {
  const telas = [{ code: "portal_solicitacoes" }, { code: "arquivos" }, { code: "recrutamento_vagas" }, { code: "bpo_comunicacao" }];

  it("tira só as telas de módulo que são do Geral e estão escondidas", () => {
    expect(semTelasDoGeralOcultas(telas, sem("solicitacoes")).map((t) => t.code)).toEqual(["arquivos", "recrutamento_vagas", "bpo_comunicacao"]);
    expect(semTelasDoGeralOcultas(telas, []).map((t) => t.code)).toEqual(["recrutamento_vagas", "bpo_comunicacao"]);
    expect(semTelasDoGeralOcultas(telas, TUDO)).toEqual(telas);
  });

  it("o de-para de módulo para tela do Geral", () => {
    expect(telaDoGeralDoModulo("portal_solicitacoes")).toBe("solicitacoes");
    expect(telaDoGeralDoModulo("arquivos")).toBe("arquivos");
    expect(telaDoGeralDoModulo("recrutamento_vagas")).toBeNull();
  });
});

describe("podeConfigurarMenuGeral", () => {
  const papeis: [UserRole, boolean][] = [
    ["SUPER_ADMIN", true],
    ["ADMIN", true],
    ["SECTOR_ADMIN", false],
    ["SECTOR_USER", false],
    ["READONLY", false],
  ];
  for (const [role, pode] of papeis) {
    it(`${role}: ${pode ? "configura" : "não configura"}`, () => {
      expect(podeConfigurarMenuGeral({ role, subscriptionReadOnly: false })).toBe(pode);
    });
  }

  it("assinatura em somente leitura bloqueia até o Super Admin", () => {
    expect(podeConfigurarMenuGeral({ role: "SUPER_ADMIN", subscriptionReadOnly: true })).toBe(false);
  });
});

describe("tutorial da equipe × telas escondidas", () => {
  // Montado a partir de um tutorial de verdade, para o teste não depender do
  // nome de cada opção — só do que esta mudança acrescentou.
  const base = { role: "SECTOR_ADMIN", escritorio: "41", setoresNoMenu: 1, avisosNoCelular: false } as OpcoesDaEquipe;
  const itensDoGestor = (o: Partial<OpcoesDaEquipe>) =>
    tutorialDaEquipe({ ...base, ...o }).passos.find((p) => p.chave === "gestor")?.itens ?? [];
  const falaDeTransferencias = (itens: string[]) => itens.some((i) => i.includes("Transferências"));

  it("sem a lista, ou com Transferências no menu, o gestor aprende onde transferir", () => {
    expect(falaDeTransferencias(itensDoGestor({}))).toBe(true);
    expect(falaDeTransferencias(itensDoGestor({ telasDoGeral: TUDO }))).toBe(true);
  });

  it("com Transferências escondida, o passo não manda para ela — e o resto do passo fica", () => {
    const itens = itensDoGestor({ telasDoGeral: sem("transferencias") });
    expect(falaDeTransferencias(itens)).toBe(false);
    expect(itens.length).toBeGreaterThan(0);
  });
});
