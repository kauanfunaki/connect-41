import { describe, expect, it } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import {
  VERSAO_DO_TUTORIAL,
  abreSozinho,
  ehTutorialDeGestor,
  pulaOTutorialSozinho,
  tutorialDaEquipe,
  tutorialDoPortal,
  type OpcoesDaEquipe,
  type Tutorial,
} from "./tutoriais";

// O que se testa: quem vê o tutorial do primeiro acesso sozinho, e quais
// passos cada pessoa vê — pelo papel, pela Lígia e pelos módulos do portal.

const PAPEIS: UserRole[] = ["SUPER_ADMIN", "ADMIN", "SECTOR_ADMIN", "SECTOR_USER", "READONLY"];

const chaves = (t: Tutorial) => t.passos.map((p) => p.chave);
const textoDe = (t: Tutorial, chave: string) => {
  const p = t.passos.find((x) => x.chave === chave);
  return p ? [p.titulo, p.texto, ...(p.itens ?? [])].join(" ") : "";
};

const EQUIPE: OpcoesDaEquipe = { role: "SECTOR_USER", escritorio: "41 Contábil", setoresNoMenu: 1, ligia: false, avisosNoCelular: false };

describe("quem vê sozinho", () => {
  it("administrador e Super Admin pulam; os outros papéis veem", () => {
    const pulam = PAPEIS.filter(pulaOTutorialSozinho);
    expect(pulam.sort()).toEqual(["ADMIN", "SUPER_ADMIN"]);
  });

  it("abre para quem nunca viu", () => {
    expect(abreSozinho({ tipo: "nunca" }, 1)).toBe(true);
  });

  it("não abre para quem já viu esta versão (ou uma mais nova)", () => {
    expect(abreSozinho({ tipo: "visto", versao: 1 }, 1)).toBe(false);
    expect(abreSozinho({ tipo: "visto", versao: 2 }, 1)).toBe(false);
  });

  it("subir a versão faz abrir de novo para quem viu a anterior", () => {
    expect(abreSozinho({ tipo: "visto", versao: 1 }, 2)).toBe(true);
  });

  it("banco fora do ar ou tabela que ainda não existe: não abre", () => {
    expect(abreSozinho({ tipo: "indisponivel" }, 1)).toBe(false);
  });

  it("as versões começam em 1", () => {
    expect(VERSAO_DO_TUTORIAL).toEqual({ equipe: 1, portal: 1 });
  });
});

describe("tutorial da equipe", () => {
  it("Colaborador: o básico, sem os passos do gestor, terminando no Pronto", () => {
    const t = tutorialDaEquipe(EQUIPE);
    expect(chaves(t)).toEqual(["boas-vindas", "menu", "meu-dia", "busca", "avisos", "ajuda", "pronto"]);
    expect(t.rotulo).toBe("Tutorial para Colaborador");
    expect(t.botaoFinal).toBe("Começar a usar o Connect");
    expect(t.versao).toBe(VERSAO_DO_TUTORIAL.equipe);
  });

  it("Gestor de setor: o time no Meu dia e o que só o gestor faz, com o aviso de que excluir é do administrador", () => {
    const t = tutorialDaEquipe({ ...EQUIPE, role: "SECTOR_ADMIN" });
    expect(chaves(t)).toEqual(["boas-vindas", "menu", "meu-dia", "meu-time", "busca", "avisos", "gestor", "ajuda", "pronto"]);
    expect(t.rotulo).toBe("Tutorial para Gestor de setor");
    expect(textoDe(t, "meu-time")).toContain("Meu time");
    expect(textoDe(t, "gestor")).toContain("Transferências");
    expect(textoDe(t, "gestor")).toContain("Excluir um registro fica com o administrador");
  });

  it("administrador que revê pela ajuda ganha os passos do gestor, sem a frase de que excluir é com o administrador", () => {
    for (const role of ["ADMIN", "SUPER_ADMIN"] as UserRole[]) {
      const t = tutorialDaEquipe({ ...EQUIPE, role });
      expect(chaves(t)).toContain("gestor");
      expect(textoDe(t, "gestor")).not.toContain("Excluir");
    }
  });

  it("Somente leitura vê os passos do Colaborador", () => {
    expect(ehTutorialDeGestor("READONLY")).toBe(false);
    expect(chaves(tutorialDaEquipe({ ...EQUIPE, role: "READONLY" }))).not.toContain("meu-time");
  });

  it("a Lígia só entra quando atende o setor da pessoa — e diz que só lê e que sugestão pede Aplicar", () => {
    expect(chaves(tutorialDaEquipe(EQUIPE))).not.toContain("ligia");
    const t = tutorialDaEquipe({ ...EQUIPE, ligia: true });
    expect(chaves(t)).toEqual(["boas-vindas", "menu", "meu-dia", "busca", "avisos", "ligia", "ajuda", "pronto"]);
    expect(textoDe(t, "ligia")).toContain("não muda nada sozinha");
    expect(textoDe(t, "ligia")).toContain("Aplicar");
  });

  it("trocar de setor só aparece para quem tem mais de um setor no menu", () => {
    expect(textoDe(tutorialDaEquipe(EQUIPE), "menu")).not.toContain("Trocar de setor");
    expect(textoDe(tutorialDaEquipe({ ...EQUIPE, setoresNoMenu: 2 }), "menu")).toContain("Trocar de setor");
  });

  it("o aviso no celular só é prometido com as chaves configuradas", () => {
    expect(textoDe(tutorialDaEquipe(EQUIPE), "avisos")).not.toContain("celular");
    expect(textoDe(tutorialDaEquipe({ ...EQUIPE, avisosNoCelular: true }), "avisos")).toContain("Configurações do perfil");
  });

  it("a boas-vindas leva o nome do escritório; sem nome, sem selo", () => {
    expect(tutorialDaEquipe(EQUIPE).passos[0]).toMatchObject({ chave: "boas-vindas", selo: "41 Contábil" });
    expect(tutorialDaEquipe({ ...EQUIPE, escritorio: null }).passos[0]!.selo).toBeUndefined();
    expect(tutorialDaEquipe({ ...EQUIPE, escritorio: "   " }).passos[0]!.selo).toBeUndefined();
  });
});

describe("tutorial do portal", () => {
  const portal = (modulos: string[], avisosNoCelular = false) =>
    tutorialDoPortal({ escritorio: "41 Contábil", modulos: new Set(modulos), avisosNoCelular });

  it("sem módulo nenhum: boas-vindas, documentos fiscais, celular e pronto", () => {
    const t = portal([]);
    expect(chaves(t)).toEqual(["boas-vindas", "documentos", "celular", "pronto"]);
    expect(t.rotulo).toBe("Tutorial para Cliente");
    expect(t.botaoFinal).toBe("Começar a usar o portal");
    expect(t.versao).toBe(VERSAO_DO_TUTORIAL.portal);
    expect(t.passos[0]).toMatchObject({ selo: "41 Contábil", titulo: "Boas-vindas ao portal" });
    expect(textoDe(t, "documentos")).toContain("Documentos fiscais");
    expect(textoDe(t, "documentos")).not.toContain("Arquivos");
  });

  it("com as solicitações: pedir, as pendências e os documentos do escritório; a Conversa sai", () => {
    const t = portal(["portal_solicitacoes", "bpo_comunicacao"]);
    expect(chaves(t)).toEqual(["boas-vindas", "solicitacoes", "pendencias", "documentos", "celular", "pronto"]);
    expect(textoDe(t, "documentos")).toContain("Documentos do escritório");
  });

  it("só a Conversa, sem as solicitações: o passo de falar com a equipe é ela", () => {
    expect(chaves(portal(["bpo_comunicacao"]))).toEqual(["boas-vindas", "conversa", "documentos", "celular", "pronto"]);
  });

  it("pendências do BPO sem as solicitações", () => {
    expect(chaves(portal(["bpo_pendencias"]))).toContain("pendencias");
  });

  it("os Arquivos entram no passo dos documentos", () => {
    expect(textoDe(portal(["arquivos"]), "documentos")).toContain("Arquivos");
  });

  it("aprovações ligadas: o passo é aprovar, com o financeiro numa linha", () => {
    const t = portal(["bpo_aprovacoes", "bpo_contas_pagar", "bpo_dre"]);
    expect(chaves(t)).toContain("aprovacoes");
    expect(chaves(t)).not.toContain("financeiro");
    expect(textoDe(t, "aprovacoes")).toContain("Em Financeiro, no menu, você acompanha: DRE e Contas a pagar.");
  });

  it("só aprovações, sem tela de financeiro: sem a linha do financeiro", () => {
    const t = portal(["bpo_aprovacoes"]);
    expect(t.passos.find((p) => p.chave === "aprovacoes")!.itens).toEqual([]);
  });

  it("financeiro sem aprovações: o passo lista as telas do menu, como o menu as chama", () => {
    const t = portal(["bpo_fluxo_caixa", "bpo_contas_receber", "bpo_cobranca"]);
    expect(chaves(t)).toContain("financeiro");
    expect(textoDe(t, "financeiro")).toContain("Fluxo de caixa, Relatório, Contas a receber e Cobrança");
  });

  it("processos do Societário", () => {
    expect(textoDe(portal(["societario_processos"]), "processos")).toContain("Exigências");
    expect(chaves(portal([]))).not.toContain("processos");
  });

  it("o aviso no celular só é prometido com as chaves configuradas", () => {
    expect(textoDe(portal([]), "celular")).not.toContain("Ativar");
    expect(textoDe(portal([], true), "celular")).toContain("Ativar");
  });

  it("todos os módulos: no máximo nove passos, o primeiro é a boas-vindas e o último o pronto", () => {
    const tudo = portal(
      [
        "portal_solicitacoes",
        "bpo_comunicacao",
        "bpo_pendencias",
        "arquivos",
        "bpo_aprovacoes",
        "bpo_contas_pagar",
        "bpo_contas_receber",
        "bpo_fluxo_caixa",
        "bpo_dre",
        "bpo_cobranca",
        "societario_processos",
      ],
      true
    );
    expect(tudo.passos.length).toBeLessThanOrEqual(9);
    expect(tudo.passos[0]!.chave).toBe("boas-vindas");
    expect(tudo.passos.at(-1)!.chave).toBe("pronto");
  });
});

describe("o texto", () => {
  const todos: Tutorial[] = [
    ...PAPEIS.flatMap((role) => [
      tutorialDaEquipe({ ...EQUIPE, role, setoresNoMenu: 3, ligia: true, avisosNoCelular: true }),
      tutorialDaEquipe({ ...EQUIPE, role }),
    ]),
    tutorialDoPortal({
      escritorio: "41 Contábil",
      modulos: new Set(["portal_solicitacoes", "bpo_pendencias", "arquivos", "bpo_aprovacoes", "bpo_dre", "societario_processos"]),
      avisosNoCelular: true,
    }),
    tutorialDoPortal({ escritorio: null, modulos: new Set(["bpo_comunicacao", "bpo_fluxo_caixa"]), avisosNoCelular: false }),
  ];
  const frases = todos.flatMap((t) => t.passos.flatMap((p) => [p.titulo, p.texto, ...(p.itens ?? [])]));

  it("não mostra endereço de tela nem link", () => {
    for (const f of frases) {
      expect(f, f).not.toMatch(/\/[a-z]|https?:|www\./i);
    }
  });

  it("sem nome técnico de papel, módulo ou campo", () => {
    for (const f of frases) {
      expect(f, f).not.toMatch(/SECTOR_|ADMIN\b|bpo_|portal_|societario_|undefined|null/);
    }
  });

  it("chaves únicas e todo passo com título e texto", () => {
    for (const t of todos) {
      expect(new Set(chaves(t)).size).toBe(t.passos.length);
      for (const p of t.passos) {
        expect(p.titulo.trim()).not.toBe("");
        expect(p.texto.trim()).not.toBe("");
      }
    }
  });

  it("frases curtas: nenhuma passa de 200 caracteres", () => {
    for (const f of frases) expect(f.length, f).toBeLessThanOrEqual(200);
  });
});
