import { describe, expect, it } from "vitest";
import {
  fraseDoItem,
  itensDaAtividade,
  resumoDaParte,
  rotuloDoTexto,
  setorDeQuemAgiu,
  trechosComMencao,
  ultimaDevolucao,
  type EventoGuardado,
  type ParteDaAtividade,
} from "./handoffAtividade";

// A Atividade e a faixa da transferência aberta (10/11/2026).

const dia = (d: number, h = 9) => new Date(Date.UTC(2026, 10, d, h + 3)); // h no relógio de Brasília
const TRANSFERENCIA = { createdAt: dia(8), requestedBy: "u-marina" };
const parte = (id: string, sectorCode: string, extra: Partial<ParteDaAtividade> = {}): ParteDaAtividade => ({
  id,
  sectorCode,
  status: "NEW",
  resolvedAt: null,
  createdAt: dia(8),
  updatedAt: dia(8),
  ...extra,
});
let seq = 0;
const evento = (type: EventoGuardado["type"], extra: Partial<EventoGuardado> = {}): EventoGuardado => ({
  id: `ev-${++seq}`,
  type,
  userId: "u-paulo",
  handoffSectorId: null,
  body: null,
  createdAt: dia(9),
  ...extra,
});
const ROTULOS: Record<string, string> = { fiscal: "Fiscal", contabil: "Contábil", societario: "Societário", controladoria: "Controladoria" };
const rotulo = (c: string) => ROTULOS[c] ?? c;

describe("transferência de antes do histórico", () => {
  it("sem evento nenhum, deduz o pedido e as finalizações pelas datas, sem autor na finalização", () => {
    const itens = itensDaAtividade(
      TRANSFERENCIA,
      [parte("p1", "fiscal", { status: "DONE", resolvedAt: dia(9, 14) }), parte("p2", "contabil", { status: "IN_PROGRESS" })],
      []
    );
    expect(itens.map((i) => [i.tipo, i.autorId, i.setorDaParte, i.deduzido])).toEqual([
      ["DONE", null, "fiscal", true],
      ["CREATED", "u-marina", null, true],
    ]);
    expect(fraseDoItem(itens[0], rotulo)).toBe("A parte do Fiscal foi finalizada");
    expect(fraseDoItem(itens[1], rotulo)).toBe("pediu a transferência");
  });

  it("finalizada sem data guardada não ganha linha", () => {
    expect(itensDaAtividade(TRANSFERENCIA, [parte("p1", "fiscal", { status: "DONE", resolvedAt: null })], []).map((i) => i.tipo)).toEqual(["CREATED"]);
  });

  it("com os eventos gravados, nada é deduzido", () => {
    const eventos = [
      evento("CREATED", { userId: "u-marina", createdAt: dia(8) }),
      evento("DONE", { handoffSectorId: "p1", createdAt: dia(9, 14) }),
    ];
    const itens = itensDaAtividade(TRANSFERENCIA, [parte("p1", "fiscal", { status: "DONE", resolvedAt: dia(9, 14) })], eventos);
    expect(itens.every((i) => !i.deduzido)).toBe(true);
    expect(itens.map((i) => i.tipo)).toEqual(["DONE", "CREATED"]);
  });

  it("antiga que andou depois do histórico: deduz só o que falta", () => {
    const itens = itensDaAtividade(TRANSFERENCIA, [parte("p1", "fiscal", { status: "IN_PROGRESS" })], [
      evento("STARTED", { handoffSectorId: "p1", createdAt: dia(10) }),
    ]);
    expect(itens.map((i) => [i.tipo, i.deduzido])).toEqual([
      ["STARTED", false],
      ["CREATED", true],
    ]);
  });
});

describe("a ordem e as frases", () => {
  it("do mais novo para o mais antigo; no empate, o pedido por último", () => {
    const itens = itensDaAtividade(TRANSFERENCIA, [parte("p1", "fiscal")], [
      evento("COMMENT", { createdAt: dia(8), body: "Oi" }),
      evento("RETURNED", { handoffSectorId: "p1", createdAt: dia(10), body: "Falta o distrato" }),
    ]);
    expect(itens.map((i) => i.tipo)).toEqual(["RETURNED", "COMMENT", "CREATED"]);
    expect(itens[0]).toMatchObject({ setorDaParte: "fiscal", texto: "Falta o distrato" });
  });

  it("cada tipo com a sua frase, e o artigo do setor certo", () => {
    const f = (tipo: EventoGuardado["type"], setor: string | null = "fiscal") => fraseDoItem({ tipo, setorDaParte: setor, autorId: "u-x" }, rotulo);
    expect(f("STARTED")).toBe("começou a parte do Fiscal");
    expect(f("DONE")).toBe("finalizou a parte do Fiscal");
    expect(f("RETURNED", "controladoria")).toBe("devolveu a parte da Controladoria");
    expect(f("RESENT")).toBe("respondeu e reenviou ao Fiscal");
    expect(f("COMMENT", null)).toBe("comentou");
    expect(f("ASSIGNEES_CHANGED")).toBe("mudou os responsáveis do Fiscal");
    expect(f("EDITED", null)).toBe("editou a transferência");
    expect(f("REOPENED")).toBe("reabriu a parte do Fiscal");
    // A parte que sumiu (SetNull) não quebra a frase.
    expect(f("STARTED", null)).toBe("começou uma parte");
  });

  it("o rótulo do texto do evento", () => {
    expect(rotuloDoTexto("RETURNED")).toBe("Motivo");
    expect(rotuloDoTexto("RESENT")).toBe("Resposta");
    expect(rotuloDoTexto("COMMENT")).toBeNull();
  });
});

describe("o setor de quem agiu", () => {
  const contexto = {
    requestedBy: "u-marina",
    fromSector: "societario",
    partes: [
      { sectorCode: "fiscal", responsaveis: ["u-paulo"] },
      { sectorCode: "contabil", responsaveis: [] },
    ],
  };

  it("a parte do evento, quando a pessoa é dela", () => {
    expect(setorDeQuemAgiu("u-ana", "contabil", { ...contexto, setoresDaPessoa: ["contabil", "fiscal"] })).toBe("contabil");
  });

  it("quem pediu é do setor de origem; o responsável, da parte dele", () => {
    expect(setorDeQuemAgiu("u-marina", null, { ...contexto, setoresDaPessoa: ["societario", "dp"] })).toBe("societario");
    expect(setorDeQuemAgiu("u-paulo", null, { ...contexto, setoresDaPessoa: ["dp"] })).toBe("fiscal");
  });

  it("senão o setor da pessoa que está na transferência; administrador sem setor fica sem", () => {
    expect(setorDeQuemAgiu("u-bia", null, { ...contexto, setoresDaPessoa: ["dp", "contabil"] })).toBe("contabil");
    expect(setorDeQuemAgiu("u-rui", null, { ...contexto, setoresDaPessoa: ["dp", "societario"] })).toBe("societario");
    expect(setorDeQuemAgiu("u-admin", null, { ...contexto, setoresDaPessoa: [] })).toBeNull();
  });
});

describe("a faixa do topo", () => {
  const agora = dia(12, 10);
  const nomes: Record<string, string> = { "u-paulo": "Paulo Lima", "u-bruno": "Bruno Alves", "u-ana": "Ana Torres" };
  const nome = (id: string) => nomes[id] ?? "?";

  it("nova há quanto tempo e sem responsável, em âmbar quando parada", () => {
    const r = resumoDaParte({ ...parte("p1", "dp", { createdAt: dia(10) }), responsaveis: [] }, [], nome, agora);
    expect(r).toEqual({ texto: "Nova há 2 dias · sem responsável", tom: "normal", parada: false });
    const parada = resumoDaParte({ ...parte("p1", "dp", { createdAt: dia(8) }), responsaveis: [] }, [], nome, agora);
    expect(parada).toMatchObject({ tom: "atencao", parada: true });
  });

  it("resolvendo com quem e desde quando (o último começo)", () => {
    const r = resumoDaParte(
      { ...parte("p1", "contabil", { status: "IN_PROGRESS", createdAt: dia(11) }), responsaveis: ["u-paulo", "u-bruno"] },
      [evento("STARTED", { handoffSectorId: "p1", createdAt: dia(11, 10) })],
      nome,
      agora
    );
    expect(r.texto).toBe("Resolvendo com Paulo Lima e Bruno Alves · desde 11 de nov.");
  });

  it("finalizada por quem e quando; nas antigas, só quando", () => {
    const comEvento = resumoDaParte(
      { ...parte("p1", "fiscal", { status: "DONE", resolvedAt: dia(9, 14) }), responsaveis: [] },
      [evento("DONE", { handoffSectorId: "p1", userId: "u-ana", createdAt: dia(9, 14) })],
      nome,
      agora
    );
    expect(comEvento).toEqual({ texto: "Finalizada por Ana Torres · 9 de nov.", tom: "normal", parada: false });
    const antiga = resumoDaParte({ ...parte("p1", "fiscal", { status: "DONE", resolvedAt: dia(9, 14) }), responsaveis: [] }, [], nome, agora);
    expect(antiga.texto).toBe("Finalizada · 9 de nov.");
  });

  it("devolvida: o motivo resumido, em vermelho, e nunca parada", () => {
    const longo = "Falta o distrato assinado pelos dois sócios e a certidão negativa de débitos estaduais atualizada do mês";
    const eventos = [
      evento("RETURNED", { handoffSectorId: "p1", body: "Primeiro motivo", createdAt: dia(9) }),
      evento("RESENT", { handoffSectorId: "p1", body: "Resolvido", createdAt: dia(10) }),
      evento("RETURNED", { handoffSectorId: "p1", body: longo, createdAt: dia(11) }),
    ];
    const r = resumoDaParte({ ...parte("p1", "fiscal", { status: "RETURNED", createdAt: dia(1) }), responsaveis: [] }, eventos, nome, agora);
    expect(r.tom).toBe("perigo");
    expect(r.parada).toBe(false);
    expect(r.texto.startsWith("Devolvida: Falta o distrato")).toBe(true);
    expect(r.texto.endsWith("…")).toBe(true);
    expect(ultimaDevolucao(eventos, "p1")?.body).toBe(longo);
    expect(ultimaDevolucao(eventos, "p2")).toBeNull();
  });
});

describe("menções no comentário", () => {
  const nomes = ["Ana", "Ana Paula Souza", "Bruno Alves"];

  it("marca o nome inteiro, o mais longo primeiro", () => {
    expect(trechosComMencao("@Ana Paula Souza e @Bruno Alves, vejam.", nomes)).toEqual([
      { texto: "@Ana Paula Souza", mencao: true },
      { texto: " e ", mencao: false },
      { texto: "@Bruno Alves", mencao: true },
      { texto: ", vejam.", mencao: false },
    ]);
  });

  it("e-mail e nome de fora da lista ficam como texto", () => {
    expect(trechosComMencao("mande para fulano@empresa.com e @Zé", nomes)).toEqual([{ texto: "mande para fulano@empresa.com e @Zé", mencao: false }]);
    expect(trechosComMencao("sem arroba", nomes)).toEqual([{ texto: "sem arroba", mencao: false }]);
  });
});
