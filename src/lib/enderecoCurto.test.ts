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
  idCurtoNoEndereco,
  lerIdCurto,
  segmentoDaTarefa,
  textoDaBusca,
  type TelaCurta,
} from "./enderecoCurto";
import { PREFIXO_DO_TIPO } from "./tech-interno/regras";

// O endereço curto das telas de detalhe (10/11/2026, pedido do Kauan): um
// prefixo da tela e o número do escritório, no lugar do uuid. Desde 25/11/2026
// (melhoria-818), o prefixo é a sigla de três letras: EMP-301 na tela,
// /empresas/emp-301 no endereço; o prefixo por extenso de antes continua lendo.

const UUID = "2f9c4e1a-5b6c-4d7e-8f90-a1b2c3d4e5f6";
const ESPERADO: Record<TelaCurta, string> = {
  empresa: "/empresas/emp-301",
  pessoa: "/pessoas/pes-301",
  chamado: "/chamados/cha-301",
  processo: "/processos/pro-301",
  transferencia: "/transferencias/tra-301",
  solicitacao: "/solicitacoes/sol-301",
  pendencia: "/pendencias/pen-301",
  tarefa: "/kanban/itens/tar-301",
};
/** O prefixo de cada tela até 25/11/2026. */
const ANTIGO: Record<TelaCurta, string> = {
  empresa: "empresa",
  pessoa: "pessoa",
  chamado: "chamado",
  processo: "processo",
  transferencia: "transferencia",
  solicitacao: "solicitacao",
  pendencia: "pendencia",
  tarefa: "tarefa",
};
const TELAS = Object.keys(TELAS_DO_ENDERECO_CURTO) as TelaCurta[];

describe("formato", () => {
  it.each(TELAS)("%s: o id curto na tela, em maiúsculas, e o endereço, em minúsculas", (tela) => {
    const segmento = ESPERADO[tela].split("/").pop()!;
    expect(endereco(tela, 301)).toBe(ESPERADO[tela]);
    expect(idCurtoNoEndereco(tela, 301)).toBe(segmento);
    expect(idCurto(tela, 301)).toBe(segmento.toUpperCase());
  });

  it("a sigla da tela no id: EMP-301, CHA-45, TAR-77", () => {
    expect(idCurto("empresa", 301)).toBe("EMP-301");
    expect(idCurto("chamado", 45)).toBe("CHA-45");
    expect(idCurto("tarefa", 77)).toBe("TAR-77");
  });

  it("os prefixos são três letras ASCII, sem acento, e um por tela", () => {
    const prefixos = TELAS.map((t) => TELAS_DO_ENDERECO_CURTO[t].prefixo);
    for (const p of prefixos) expect(p).toMatch(/^[a-z]{3}$/);
    expect(new Set(prefixos).size).toBe(prefixos.length);
  });

  it("nenhuma sigla repete a de um tipo do Controle interno", () => {
    const doControle = new Set(Object.values(PREFIXO_DO_TIPO));
    for (const t of TELAS) expect(doControle.has(TELAS_DO_ENDERECO_CURTO[t].prefixo), t).toBe(false);
  });

  it("sem o número, o endereço fica com o uuid (que abre e passa para o curto)", () => {
    expect(enderecoDe("empresa", { id: UUID, number: 7 })).toBe("/empresas/emp-7");
    expect(enderecoDe("empresa", { id: UUID })).toBe(`/empresas/${UUID}`);
    expect(enderecoDe("pendencia", { id: UUID, number: null })).toBe(`/pendencias/${UUID}`);
  });

  it("a tarefa abre no próprio quadro", () => {
    expect(enderecoDaTarefa("quadro-1", { id: UUID, number: 77 })).toBe("/kanban/quadro-1/itens/tar-77");
    expect(enderecoDaTarefa("quadro-1", { id: UUID })).toBe(`/kanban/quadro-1/itens/${UUID}`);
    expect(segmentoDaTarefa({ id: UUID, number: 77 })).toBe("tar-77");
  });
});

describe("leitura", () => {
  it.each(TELAS)("%s: lê a sigla, sem diferença de maiúsculas", (tela) => {
    const curto = idCurto(tela, 45);
    expect(lerIdCurto(tela, curto)).toBe(45);
    expect(lerIdCurto(tela, curto.toLowerCase())).toBe(45);
    expect(lerIdCurto(tela, idCurtoNoEndereco(tela, 45))).toBe(45);
    expect(lerIdCurto(tela, ` ${curto} `)).toBe(45);
  });

  it.each(TELAS)("%s: o prefixo antigo continua lendo, sem diferença de maiúsculas", (tela) => {
    expect(lerIdCurto(tela, `${ANTIGO[tela]}-45`)).toBe(45);
    expect(lerIdCurto(tela, `${ANTIGO[tela].toUpperCase()}-45`)).toBe(45);
  });

  it("não aceita o prefixo de outra tela, novo ou antigo", () => {
    expect(lerIdCurto("empresa", "pes-12")).toBeNull();
    expect(lerIdCurto("empresa", "pessoa-12")).toBeNull();
    expect(lerIdCurto("tarefa", "CHA-12")).toBeNull();
    expect(lerIdCurto("tarefa", "chamado-12")).toBeNull();
    expect(lerIdCurto("transferencia", "tar-12")).toBeNull();
    expect(lerIdCurto("processo", "pes-12")).toBeNull();
    expect(lerIdCurto("solicitacao", "solicitação-12")).toBeNull();
  });

  it("números de 1 a 2147483647, sem zero à esquerda, sinal ou sobra", () => {
    expect(lerIdCurto("empresa", "emp-1")).toBe(1);
    expect(lerIdCurto("empresa", "EMP-2147483647")).toBe(2147483647);
    for (const ruim of ["emp-0", "emp-01", "emp-2147483648", "emp-99999999999", "emp--1", "emp-1a", "emp-", "emp", "emp-1.5", "emp-1/socios", "empr-1", "em-1", "empresa-0", ""]) {
      expect(lerIdCurto("empresa", ruim), ruim).toBeNull();
    }
  });

  it("uuid", () => {
    expect(ehUuid(UUID)).toBe(true);
    expect(ehUuid(UUID.toUpperCase())).toBe(true);
    expect(ehUuid("emp-1")).toBe(false);
    expect(ehUuid(`${UUID}x`)).toBe(false);
  });

  it("o que procurar: o uuid pelo id, o id curto pelo número, o resto é nada", () => {
    expect(alvoDoEndereco("chamado", UUID)).toEqual({ id: UUID });
    expect(alvoDoEndereco("chamado", "cha-45")).toEqual({ number: 45 });
    expect(alvoDoEndereco("chamado", "CHA-45")).toEqual({ number: 45 });
    expect(alvoDoEndereco("chamado", "chamado-45")).toEqual({ number: 45 });
    expect(alvoDoEndereco("chamado", "Chamado-45")).toEqual({ number: 45 });
    expect(alvoDoEndereco("chamado", "pro-45")).toBeNull();
    expect(alvoDoEndereco("chamado", "45")).toBeNull();
    expect(alvoDoEndereco("chamado", "../admin")).toBeNull();
  });
});

describe("decisão da tela de detalhe", () => {
  it("registro que não existe → 404", () => {
    expect(decidirEndereco("empresa", "emp-999", null)).toEqual({ tipo: "nao_encontrado" });
    expect(decidirEndereco("empresa", UUID, null)).toEqual({ tipo: "nao_encontrado" });
  });

  it("no id curto de agora → abre", () => {
    expect(decidirEndereco("empresa", "emp-301", { number: 301 })).toEqual({ tipo: "abrir" });
  });

  it("no uuid → vai para o curto, com a query", () => {
    expect(decidirEndereco("empresa", UUID, { number: 301 })).toEqual({ tipo: "redirecionar", para: "/empresas/emp-301" });
    expect(decidirEndereco("empresa", UUID, { number: 301 }, { tab: "files" })).toEqual({ tipo: "redirecionar", para: "/empresas/emp-301?tab=files" });
    expect(decidirEndereco("pendencia", UUID, { number: 9 }, { a: ["1", "2"], vazio: undefined })).toEqual({
      tipo: "redirecionar",
      para: "/pendencias/pen-9?a=1&a=2",
    });
  });

  it("noutra grafia (maiúsculas) → vai para a de agora, em minúsculas", () => {
    expect(decidirEndereco("chamado", "CHA-45", { number: 45 })).toEqual({ tipo: "redirecionar", para: "/chamados/cha-45" });
  });

  it.each(TELAS)("%s: o endereço antigo continua abrindo e passa para o novo, com a query", (tela) => {
    expect(decidirEndereco(tela, `${ANTIGO[tela]}-301`, { number: 301 }, { aba: "x" })).toEqual({ tipo: "redirecionar", para: `${ESPERADO[tela]}?aba=x` });
    expect(decidirEndereco(tela, `${ANTIGO[tela].toUpperCase()}-301`, { number: 301 })).toEqual({ tipo: "redirecionar", para: ESPERADO[tela] });
  });

  it("a tarefa fica dentro do quadro", () => {
    expect(decidirEndereco("tarefa", UUID, { number: 77 }, {}, { base: "/kanban/q1/itens" })).toEqual({ tipo: "redirecionar", para: "/kanban/q1/itens/tar-77" });
    expect(decidirEndereco("tarefa", "tarefa-77", { number: 77 }, {}, { base: "/kanban/q1/itens" })).toEqual({ tipo: "redirecionar", para: "/kanban/q1/itens/tar-77" });
    expect(decidirEndereco("tarefa", "tar-77", { number: 77 }, {}, { base: "/kanban/q1/itens" })).toEqual({ tipo: "abrir" });
  });

  it("nas telas abaixo da ficha, o resto do caminho vai junto, antes da query", () => {
    expect(decidirEndereco("empresa", UUID, { number: 301 }, { novo: "1" }, { resto: "/beneficios" })).toEqual({
      tipo: "redirecionar",
      para: "/empresas/emp-301/beneficios?novo=1",
    });
    expect(decidirEndereco("pessoa", UUID, { number: 12 }, undefined, { resto: "/desligamento/t1/conferencia" })).toEqual({
      tipo: "redirecionar",
      para: "/pessoas/pes-12/desligamento/t1/conferencia",
    });
    expect(decidirEndereco("pessoa", "pessoa-12", { number: 12 }, undefined, { resto: "/ferias" })).toEqual({ tipo: "redirecionar", para: "/pessoas/pes-12/ferias" });
    expect(decidirEndereco("pessoa", "pes-12", { number: 12 }, undefined, { resto: "/ferias" })).toEqual({ tipo: "abrir" });
  });

  it("a query volta para texto com escape", () => {
    expect(textoDaBusca(undefined)).toBe("");
    expect(textoDaBusca({})).toBe("");
    expect(textoDaBusca({ q: "a b&c", editar: "1" })).toBe("?q=a+b%26c&editar=1");
  });
});
