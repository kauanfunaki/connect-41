import { describe, expect, it } from "vitest";
import {
  TELAS_DO_ENDERECO_CURTO,
  alvoDoEndereco,
  decidirEndereco,
  ehUuid,
  endereco,
  enderecoDaTarefa,
  enderecoDe,
  idCurto,
  lerIdCurto,
  textoDaBusca,
  type TelaCurta,
} from "./enderecoCurto";

// O endereço curto das telas de detalhe (10/11/2026, pedido do Kauan): o nome
// da tela no singular e o número do escritório, no lugar do uuid.

const UUID = "2f9c4e1a-5b6c-4d7e-8f90-a1b2c3d4e5f6";
const ESPERADO: Record<TelaCurta, string> = {
  empresa: "/empresas/empresa-301",
  pessoa: "/pessoas/pessoa-301",
  chamado: "/chamados/chamado-301",
  processo: "/processos/processo-301",
  transferencia: "/transferencias/transferencia-301",
  solicitacao: "/solicitacoes/solicitacao-301",
  pendencia: "/pendencias/pendencia-301",
  tarefa: "/kanban/itens/tarefa-301",
};
const TELAS = Object.keys(TELAS_DO_ENDERECO_CURTO) as TelaCurta[];

describe("formato", () => {
  it.each(TELAS)("%s: o id curto e o endereço", (tela) => {
    expect(endereco(tela, 301)).toBe(ESPERADO[tela]);
    expect(idCurto(tela, 301)).toBe(ESPERADO[tela].split("/").pop());
  });

  it("os prefixos são ASCII, sem acento, e um por tela", () => {
    const prefixos = TELAS.map((t) => TELAS_DO_ENDERECO_CURTO[t].prefixo);
    for (const p of prefixos) expect(p).toMatch(/^[a-z]+$/);
    expect(new Set(prefixos).size).toBe(prefixos.length);
  });

  it("sem o número, o endereço fica com o uuid (que abre e passa para o curto)", () => {
    expect(enderecoDe("empresa", { id: UUID, number: 7 })).toBe("/empresas/empresa-7");
    expect(enderecoDe("empresa", { id: UUID })).toBe(`/empresas/${UUID}`);
    expect(enderecoDe("pendencia", { id: UUID, number: null })).toBe(`/pendencias/${UUID}`);
  });

  it("a tarefa abre no próprio quadro", () => {
    expect(enderecoDaTarefa("quadro-1", { id: UUID, number: 77 })).toBe("/kanban/quadro-1/itens/tarefa-77");
    expect(enderecoDaTarefa("quadro-1", { id: UUID })).toBe(`/kanban/quadro-1/itens/${UUID}`);
  });
});

describe("leitura", () => {
  it.each(TELAS)("%s: lê o próprio prefixo, sem diferença de maiúsculas", (tela) => {
    const curto = idCurto(tela, 45);
    expect(lerIdCurto(tela, curto)).toBe(45);
    expect(lerIdCurto(tela, curto.toUpperCase())).toBe(45);
    expect(lerIdCurto(tela, ` ${curto} `)).toBe(45);
  });

  it("não aceita o prefixo de outra tela", () => {
    expect(lerIdCurto("empresa", "pessoa-12")).toBeNull();
    expect(lerIdCurto("tarefa", "chamado-12")).toBeNull();
    expect(lerIdCurto("solicitacao", "solicitação-12")).toBeNull();
  });

  it("números de 1 a 2147483647, sem zero à esquerda, sinal ou sobra", () => {
    expect(lerIdCurto("empresa", "empresa-1")).toBe(1);
    expect(lerIdCurto("empresa", "empresa-2147483647")).toBe(2147483647);
    for (const ruim of ["empresa-0", "empresa-01", "empresa-2147483648", "empresa-99999999999", "empresa--1", "empresa-1a", "empresa-", "empresa", "empresa-1.5", "empresa-1/socios", ""]) {
      expect(lerIdCurto("empresa", ruim), ruim).toBeNull();
    }
  });

  it("uuid", () => {
    expect(ehUuid(UUID)).toBe(true);
    expect(ehUuid(UUID.toUpperCase())).toBe(true);
    expect(ehUuid("empresa-1")).toBe(false);
    expect(ehUuid(`${UUID}x`)).toBe(false);
  });

  it("o que procurar: o uuid pelo id, o id curto pelo número, o resto é nada", () => {
    expect(alvoDoEndereco("chamado", UUID)).toEqual({ id: UUID });
    expect(alvoDoEndereco("chamado", "chamado-45")).toEqual({ number: 45 });
    expect(alvoDoEndereco("chamado", "Chamado-45")).toEqual({ number: 45 });
    expect(alvoDoEndereco("chamado", "processo-45")).toBeNull();
    expect(alvoDoEndereco("chamado", "45")).toBeNull();
    expect(alvoDoEndereco("chamado", "../admin")).toBeNull();
  });
});

describe("decisão da tela de detalhe", () => {
  it("registro que não existe → 404", () => {
    expect(decidirEndereco("empresa", "empresa-999", null)).toEqual({ tipo: "nao_encontrado" });
    expect(decidirEndereco("empresa", UUID, null)).toEqual({ tipo: "nao_encontrado" });
  });

  it("no id curto de agora → abre", () => {
    expect(decidirEndereco("empresa", "empresa-301", { number: 301 })).toEqual({ tipo: "abrir" });
  });

  it("no uuid → vai para o curto, com a query", () => {
    expect(decidirEndereco("empresa", UUID, { number: 301 })).toEqual({ tipo: "redirecionar", para: "/empresas/empresa-301" });
    expect(decidirEndereco("empresa", UUID, { number: 301 }, { tab: "files" })).toEqual({ tipo: "redirecionar", para: "/empresas/empresa-301?tab=files" });
    expect(decidirEndereco("pendencia", UUID, { number: 9 }, { a: ["1", "2"], vazio: undefined })).toEqual({
      tipo: "redirecionar",
      para: "/pendencias/pendencia-9?a=1&a=2",
    });
  });

  it("noutra grafia (maiúsculas) → vai para a de agora", () => {
    expect(decidirEndereco("chamado", "CHAMADO-45", { number: 45 })).toEqual({ tipo: "redirecionar", para: "/chamados/chamado-45" });
  });

  it("a tarefa fica dentro do quadro", () => {
    expect(decidirEndereco("tarefa", UUID, { number: 77 }, {}, { base: "/kanban/q1/itens" })).toEqual({ tipo: "redirecionar", para: "/kanban/q1/itens/tarefa-77" });
    expect(decidirEndereco("tarefa", "tarefa-77", { number: 77 }, {}, { base: "/kanban/q1/itens" })).toEqual({ tipo: "abrir" });
  });

  it("nas telas abaixo da ficha, o resto do caminho vai junto, antes da query", () => {
    expect(decidirEndereco("empresa", UUID, { number: 301 }, { novo: "1" }, { resto: "/beneficios" })).toEqual({
      tipo: "redirecionar",
      para: "/empresas/empresa-301/beneficios?novo=1",
    });
    expect(decidirEndereco("pessoa", UUID, { number: 12 }, undefined, { resto: "/desligamento/t1/conferencia" })).toEqual({
      tipo: "redirecionar",
      para: "/pessoas/pessoa-12/desligamento/t1/conferencia",
    });
    expect(decidirEndereco("pessoa", "pessoa-12", { number: 12 }, undefined, { resto: "/ferias" })).toEqual({ tipo: "abrir" });
  });

  it("a query volta para texto com escape", () => {
    expect(textoDaBusca(undefined)).toBe("");
    expect(textoDaBusca({})).toBe("");
    expect(textoDaBusca({ q: "a b&c", editar: "1" })).toBe("?q=a+b%26c&editar=1");
  });
});
