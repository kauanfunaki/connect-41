import { describe, expect, it } from "vitest";
import {
  ATUALIZAR_A_CADA_MS,
  buscarConversas,
  contarRecortes,
  horaDeAtualizar,
  hrefDaConversa,
  hrefDoRecorte,
  navegacaoDoPainel,
  sufixoDoRecorte,
} from "./caixa";
import type { ConversaParaTela } from "./conversas";

type Linha = ConversaParaTela & {
  id: string;
  nome: string | null;
  vaga: string | null;
  waPhone: string;
  responsavel: { id: string } | null;
};

function linha(over: Partial<Linha> = {}): Linha {
  return {
    id: "c1",
    nome: null,
    vaga: null,
    waPhone: "5541999990000",
    responsavel: null,
    optedOutAt: null,
    handoffAt: null,
    lastInboundAt: null,
    candidaturaId: null,
    janelaLivreHoras: 24,
    atendimentoEncerradoEm: null,
    ...over,
  };
}

describe("a busca da lista", () => {
  const lista = [
    linha({ id: "a", nome: "Fabrice Edouard", vaga: "Auxiliar Fiscal", waPhone: "5541999990001" }),
    linha({ id: "b", nome: null, vaga: null, waPhone: "5511988887777" }),
    linha({ id: "c", nome: "Ana Souza", vaga: "Analista DP", waPhone: "5521977776666" }),
  ];

  it("vazia (ou só espaço) devolve a lista como está", () => {
    expect(buscarConversas(lista, "")).toBe(lista);
    expect(buscarConversas(lista, "   ").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("acha por trecho do nome ou da vaga, sem ligar para maiúscula", () => {
    expect(buscarConversas(lista, "fabr").map((c) => c.id)).toEqual(["a"]);
    expect(buscarConversas(lista, "ANALISTA").map((c) => c.id)).toEqual(["c"]);
  });

  it("acha pelo telefone a partir de três dígitos, com ou sem máscara", () => {
    expect(buscarConversas(lista, "(11) 98888").map((c) => c.id)).toEqual(["b"]);
    expect(buscarConversas(lista, "7777").map((c) => c.id)).toEqual(["b", "c"]);
    // Dois dígitos casam com quase todo número: não buscam pelo telefone.
    expect(buscarConversas(lista, "55")).toEqual([]);
  });
});

describe("o número de cada aba", () => {
  it("conta todas, as que esperam alguém sem responsável e as minhas", () => {
    const quando = new Date("2026-10-14T12:00:00Z");
    const lista = [
      linha({ id: "a" }),
      linha({ id: "b", handoffAt: quando }),
      linha({ id: "c", handoffAt: quando, responsavel: { id: "eu" } }),
      linha({ id: "d", responsavel: { id: "outra" } }),
      // Pediu para parar: não espera ninguém, mesmo transferida.
      linha({ id: "e", handoffAt: quando, optedOutAt: quando }),
    ];
    expect(contarRecortes(lista, "eu")).toEqual({ todas: 5, sem_responsavel: 1, minhas: 1 });
  });
});

describe("os endereços da caixa", () => {
  it("o recorte vai na URL, menos o padrão", () => {
    expect(sufixoDoRecorte("todas")).toBe("");
    expect(sufixoDoRecorte("minhas")).toBe("?ver=minhas");
    expect(hrefDaConversa("abc", "sem_responsavel")).toBe("/whatsapp/abc?ver=sem_responsavel");
    expect(hrefDaConversa("abc", "todas")).toBe("/whatsapp/abc");
  });

  it("trocar de aba fica na conversa aberta, ou na lista", () => {
    expect(hrefDoRecorte("abc", "minhas")).toBe("/whatsapp/abc?ver=minhas");
    expect(hrefDoRecorte(null, "minhas")).toBe("/whatsapp?ver=minhas");
    expect(hrefDoRecorte(null, "todas")).toBe("/whatsapp");
  });
});

describe("o ↑↓ e o ✕ do painel", () => {
  const visiveis = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("andam pela lista que está à esquerda, levando o recorte", () => {
    expect(navegacaoDoPainel(visiveis, "b", "minhas")).toEqual({
      fechar: "/whatsapp?ver=minhas",
      anterior: "/whatsapp/a?ver=minhas",
      proxima: "/whatsapp/c?ver=minhas",
    });
  });

  it("param nas pontas", () => {
    expect(navegacaoDoPainel(visiveis, "a", "todas")).toEqual({ fechar: "/whatsapp", anterior: null, proxima: "/whatsapp/b" });
    expect(navegacaoDoPainel(visiveis, "c", "todas").proxima).toBeNull();
  });

  it("com a aberta fora da lista (a busca escondeu), o ↓ leva à primeira", () => {
    expect(navegacaoDoPainel(visiveis, "x", "todas")).toEqual({ fechar: "/whatsapp", anterior: null, proxima: "/whatsapp/a" });
    expect(navegacaoDoPainel([], "x", "todas")).toEqual({ fechar: "/whatsapp", anterior: null, proxima: null });
  });
});

describe("a busca do que chegou", () => {
  it("só com a aba à vista e passado o intervalo", () => {
    const ultima = 1_000_000;
    expect(horaDeAtualizar(ultima, ultima + ATUALIZAR_A_CADA_MS - 1, true)).toBe(false);
    expect(horaDeAtualizar(ultima, ultima + ATUALIZAR_A_CADA_MS, true)).toBe(true);
    expect(horaDeAtualizar(ultima, ultima + ATUALIZAR_A_CADA_MS * 10, false)).toBe(false);
  });
});
