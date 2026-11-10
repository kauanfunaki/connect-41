import { describe, expect, it } from "vitest";
import { itensEntregues, type ItemEntregue, type ItemParaEntregas, type MudancaParaEntregas } from "./entregas";
import { DIAS_PARADO, entrouNaSituacao, pontosPorSemana, resumoDoTime, saudeDoFluxo, segundaDaSemana, type ItemAberto } from "./produtividade";

// Produtividade da Tech (05/11/2026, opção A da tela 7).

const d = (s: string) => new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
const mud = (itemId: string, quando: string, de: string | null, para: string): MudancaParaEntregas => ({
  itemId,
  createdAt: d(quando),
  changes: [{ field: "Situação", before: de, after: para }],
});
const entregue = (p: Partial<ItemEntregue>): ItemEntregue => ({
  id: "e1",
  title: "Entrega",
  size: "M",
  pontos: 3,
  validado: true,
  assigneeId: "ana",
  assigneeName: "Ana",
  concluidoEm: d("2026-10-07"),
  inicioEm: d("2026-10-02"),
  cicloDias: 5,
  voltasDaValidacao: 0,
  originItemId: null,
  originTitle: null,
  retrabalho: 0,
  endereco: "/controle-interno/bug-1",
  originEndereco: null,
  ...p,
});
const aberto = (p: Partial<ItemAberto>): ItemAberto => ({
  id: "a1",
  title: "Aberto",
  status: "IN_PROGRESS",
  size: "M",
  assigneeId: "ana",
  assigneeName: "Ana",
  createdAt: d("2026-10-01"),
  ultimaMexidaEm: d("2026-11-04"),
  endereco: "/controle-interno/bug-2",
  ...p,
});
const AGORA = d("2026-11-05");

describe("itens entregues", () => {
  const item = (p: Partial<ItemParaEntregas>): ItemParaEntregas & { endereco: string } => ({
    endereco: `/controle-interno/bug-${p.id ?? "i1"}`, id: "i1", title: "Item", status: "DONE", size: "G", assigneeId: "ana", assigneeName: "Ana", originItemId: null, createdAt: d("2026-10-01"), ...p,
  });
  const validado = (id: string, fim = "2026-10-06") => [mud(id, "2026-10-02", "Pendente", "Em andamento"), mud(id, "2026-10-04", "Em andamento", "Em validação"), mud(id, fim, "Em validação", "Concluído")];

  it("um por item concluído no período, com pontos só na validada, o 'veio de' e o retrabalho que gerou", () => {
    const lista = itensEntregues(
      [
        { ...item({ id: "a", size: "G" }), originTitle: null },
        { ...item({ id: "b", size: "P", originItemId: "x" }), originTitle: "Tela de login", originEndereco: "/controle-interno/melhoria-3" },
        item({ id: "c", size: "M" }),
        item({ id: "bug", status: "PENDING", originItemId: "a" }),
        item({ id: "fora", size: "G" }),
      ],
      [...validado("a", "2026-10-08"), ...validado("b"), mud("c", "2026-10-03", "Pendente", "Concluído"), ...validado("fora", "2026-09-20")],
      d("2026-10-01"),
      d("2026-12-31")
    );
    expect(lista.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(lista[0]).toMatchObject({ pontos: 8, validado: true, cicloDias: 6, retrabalho: 1 });
    expect(lista[1]).toMatchObject({ pontos: 1, originItemId: "x", originTitle: "Tela de login", endereco: "/controle-interno/bug-b", originEndereco: "/controle-interno/melhoria-3" });
    expect(lista[0]).toMatchObject({ endereco: "/controle-interno/bug-a", originEndereco: null });
    expect(lista[2]).toMatchObject({ pontos: 0, validado: false, cicloDias: null });
  });
});

describe("resumo do time", () => {
  it("soma pontos e retrabalho, e o ciclo é a mediana das entregas (não das pessoas)", () => {
    const r = resumoDoTime(
      [
        entregue({ id: "1", pontos: 8, cicloDias: 2, retrabalho: 1 }),
        entregue({ id: "2", pontos: 3, cicloDias: 4 }),
        entregue({ id: "3", pontos: 0, validado: false, cicloDias: 10, assigneeId: "bia" }),
        entregue({ id: "4", pontos: 1, cicloDias: null }),
      ],
      { total: 5, noPrazo: 4 }
    );
    expect(r).toEqual({ pontos: 12, entregas: 4, validadas: 3, cicloMedianoDias: 4, retrabalho: 1, chamados: 5, chamadosNoPrazo: 4 });
  });

  it("sem entrega, sem ciclo", () => {
    expect(resumoDoTime([], { total: 0, noPrazo: 0 }).cicloMedianoDias).toBeNull();
  });
});

describe("pontos por semana", () => {
  it("a semana começa na segunda em Brasília", () => {
    // Segunda, 05/10, às 01:00 em Greenwich ainda é domingo, 04/10, em Brasília.
    expect(segundaDaSemana(d("2026-10-05T01:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(segundaDaSemana(d("2026-10-05T04:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(segundaDaSemana(d("2026-10-11T20:00:00Z")).toISOString().slice(0, 10)).toBe("2026-10-05");
  });

  it("uma coluna por semana do período, pontos por pessoa, sem a entrega que não pontuou", () => {
    const { semanas, pessoas } = pontosPorSemana(
      [
        entregue({ id: "1", pontos: 3, concluidoEm: d("2026-10-06") }),
        entregue({ id: "2", pontos: 8, concluidoEm: d("2026-10-08") }),
        entregue({ id: "3", pontos: 1, concluidoEm: d("2026-10-14"), assigneeId: "bia", assigneeName: "Bia" }),
        entregue({ id: "4", pontos: 0, validado: false, concluidoEm: d("2026-10-14"), assigneeId: "caio", assigneeName: "Caio" }),
        entregue({ id: "5", pontos: 3, concluidoEm: d("2026-10-15"), assigneeId: null, assigneeName: "Sem responsável" }),
      ],
      d("2026-10-01"),
      d("2026-10-20")
    );
    expect(semanas.map((s) => s.chave)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(semanas[1]).toMatchObject({ rotulo: "05/10", rotuloLongo: "Semana de 05/10 a 11/10", porPessoa: { ana: 11 }, total: 11 });
    expect(semanas[2].porPessoa).toEqual({ bia: 1, "": 3 });
    expect(semanas[0].total).toBe(0);
    // Por nome, não por pontos: a cor segue a pessoa.
    expect(pessoas.map((p) => p.nome)).toEqual(["Ana", "Bia", "Sem responsável"]);
    expect(pessoas[0].total).toBe(11);
  });
});

describe("saúde do fluxo", () => {
  it("em aberto sem tamanho, separando os que já começaram", () => {
    const s = saudeDoFluxo(
      [aberto({ id: "p", status: "PENDING", size: null }), aberto({ id: "a", size: null, createdAt: d("2026-09-01") }), aberto({ id: "ok" })],
      [],
      [],
      AGORA
    );
    expect(s.semTamanho.total).toBe(2);
    expect(s.semTamanho.comecados).toBe(1);
    expect(s.semTamanho.itens[0].id).toBe("a");
  });

  it(`parado é em andamento ou validação sem mexer há mais de ${DIAS_PARADO} dias; pendente não conta`, () => {
    const s = saudeDoFluxo(
      [
        aberto({ id: "5dias", ultimaMexidaEm: d("2026-10-31") }),
        aberto({ id: "6dias", ultimaMexidaEm: d("2026-10-30") }),
        aberto({ id: "valid", status: "VALIDATION", ultimaMexidaEm: d("2026-10-20") }),
        aberto({ id: "pend", status: "PENDING", ultimaMexidaEm: d("2026-09-01") }),
      ],
      [],
      [],
      AGORA
    );
    expect(s.parados.total).toBe(2);
    expect(s.parados.itens.map((i) => [i.id, i.dias])).toEqual([["valid", 16], ["6dias", 6]]);
  });

  it("esperando validação conta desde a última entrada em validação", () => {
    const mudancas = [
      mud("v1", "2026-10-20", "Em andamento", "Em validação"),
      mud("v1", "2026-10-22", "Em validação", "Em andamento"),
      mud("v1", "2026-11-02", "Em andamento", "Em validação"),
    ];
    expect(entrouNaSituacao({ id: "v1", status: "VALIDATION", createdAt: d("2026-10-01") }, mudancas)).toEqual(d("2026-11-02"));
    // Sem histórico de situação (criado já em validação), conta da criação.
    expect(entrouNaSituacao({ id: "v2", status: "VALIDATION", createdAt: d("2026-10-25") }, mudancas)).toEqual(d("2026-10-25"));
    const s = saudeDoFluxo(
      [aberto({ id: "v1", status: "VALIDATION" }), aberto({ id: "v2", status: "VALIDATION", createdAt: d("2026-10-25") })],
      mudancas,
      [],
      AGORA
    );
    expect(s.esperandoValidacao).toMatchObject({ total: 2, maisAntigoDias: 11 });
    expect(s.esperandoValidacao.itens.map((i) => i.id)).toEqual(["v2", "v1"]);
  });

  it("em andamento por pessoa, do maior para o menor, com quem está sem responsável", () => {
    const s = saudeDoFluxo(
      [
        aberto({ id: "1", assigneeId: "bia", assigneeName: "Bia" }),
        aberto({ id: "2" }),
        aberto({ id: "3" }),
        aberto({ id: "4", assigneeId: null, assigneeName: null }),
        aberto({ id: "5", status: "VALIDATION" }),
      ],
      [],
      [],
      AGORA
    );
    expect(s.emAndamentoPorPessoa).toEqual([
      { chave: "ana", nome: "Ana", total: 2 },
      { chave: "bia", nome: "Bia", total: 1 },
      { chave: "", nome: "Sem responsável", total: 1 },
    ]);
  });

  it("média de voltas da validação por entrega do período", () => {
    const s = saudeDoFluxo([], [], [entregue({ id: "1", voltasDaValidacao: 2 }), entregue({ id: "2" }), entregue({ id: "3", voltasDaValidacao: 1 })], AGORA);
    expect(s).toMatchObject({ voltas: 3, entregas: 3, mediaDeVoltas: 1 });
    expect(saudeDoFluxo([], [], [], AGORA).mediaDeVoltas).toBeNull();
  });
});
