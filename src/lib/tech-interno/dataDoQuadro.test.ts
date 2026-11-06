import { describe, expect, it } from "vitest";
import { diaDaConclusaoNoQuadro, momentoDoDia, planejarDatas, type ItemLido } from "./dataDoQuadro";

const ORIGEM = 'Veio do Quadro do Obsidian: seção "Feito em 2026-10-28", linha 1008. No Quadro: situação "Feito".';
const descricao = (data = "28/10/2026") => `O que mudou.\n\n${ORIGEM}\nConcluído no Quadro em ${data}.`;
const HOJE = new Date("2026-11-06T14:00:00Z");
const criadoHoje = new Date("2026-11-06T13:00:00Z");

function item(over: Partial<ItemLido> = {}): ItemLido {
  return {
    id: "i1", title: "Migrations reconstroem o banco", status: "DONE", version: 0,
    description: descricao(), createdAt: criadoHoje, updatedAt: criadoHoje,
    changes: [{ id: "m0", version: 0, createdAt: criadoHoje, changes: [{ field: "Título", before: null, after: "x" }, { field: "Situação", before: null, after: "Concluído" }] }],
    ...over,
  };
}

describe("diaDaConclusaoNoQuadro", () => {
  it("lê o dia da marca", () => expect(diaDaConclusaoNoQuadro(descricao())).toBe("2026-10-28"));
  it("sem a origem do Quadro não vale, mesmo com a frase", () => expect(diaDaConclusaoNoQuadro("Concluído no Quadro em 28/10/2026.")).toBeNull());
  it("recusa data que não existe", () => expect(diaDaConclusaoNoQuadro(descricao("31/02/2026"))).toBeNull());
  it("sem descrição", () => expect(diaDaConclusaoNoQuadro(null)).toBeNull());
});

describe("momentoDoDia", () => {
  it("é meio-dia em São Paulo, no mesmo dia em UTC", () => expect(momentoDoDia("2026-10-28").toISOString()).toBe("2026-10-28T15:00:00.000Z"));
});

describe("planejarDatas", () => {
  it("data o item que nasceu concluído e não mudou mais", () => {
    const { datar, pular } = planejarDatas([item()], HOJE);
    expect(pular).toEqual([]);
    expect(datar).toHaveLength(1);
    expect(datar[0]).toMatchObject({ id: "i1", dia: "2026-10-28", mudancaId: "m0", levaAtualizacao: true });
    expect(datar[0]!.para.toISOString()).toBe("2026-10-28T15:00:00.000Z");
  });

  it("item editado depois (sem mexer na situação) é datado, mas a última mexida fica", () => {
    const editado = item({ version: 1, changes: [...item().changes, { id: "m1", version: 1, createdAt: HOJE, changes: [{ field: "Sistema", before: "Sem sistema", after: "Connect 41" }] }] });
    const { datar } = planejarDatas([editado], HOJE);
    expect(datar[0]!.levaAtualizacao).toBe(false);
  });

  it("situação mudada depois da criação fica de fora", () => {
    const reaberto = item({ version: 2, changes: [...item().changes,
      { id: "m1", version: 1, createdAt: HOJE, changes: [{ field: "Situação", before: "Concluído", after: "Em andamento" }] },
      { id: "m2", version: 2, createdAt: HOJE, changes: [{ field: "Situação", before: "Em andamento", after: "Concluído" }] }] });
    expect(planejarDatas([reaberto], HOJE).pular[0]!.motivo).toMatch(/mudou depois/);
  });

  it("item que não nasceu concluído fica de fora", () => {
    const pendente = item({ changes: [{ id: "m0", version: 0, createdAt: criadoHoje, changes: [{ field: "Situação", before: null, after: "Pendente" }] }] });
    expect(planejarDatas([pendente], HOJE).pular[0]!.motivo).toMatch(/não nasceu Concluído/);
  });

  it("item em aberto com a marca aparece como pulado; sem a marca do Quadro, nem aparece", () => {
    const r = planejarDatas([item({ status: "PENDING" }), item({ id: "i2", description: "Criado na tela." })], HOJE);
    expect(r.pular).toEqual([{ id: "i1", title: "Migrations reconstroem o banco", motivo: "está Pendente no Connect" }]);
    expect(r.datar).toEqual([]);
  });

  it("concluído do Quadro sem data fica de fora, com o motivo", () => {
    expect(planejarDatas([item({ description: `${ORIGEM}` })], HOJE).pular[0]!.motivo).toMatch(/Concluído no Quadro em/);
  });

  it("rodar de novo não muda nada: o já datado só é contado", () => {
    const para = momentoDoDia("2026-10-28");
    const datado = item({ createdAt: para, updatedAt: para, changes: [{ ...item().changes[0]!, createdAt: para }] });
    expect(planejarDatas([datado], HOJE)).toEqual({ datar: [], pular: [], jaDatados: 1 });
  });

  it("nunca leva a data para a frente", () => {
    const antigo = item({ createdAt: new Date("2026-10-01T12:00:00Z") });
    expect(planejarDatas([antigo], HOJE).pular[0]!.motivo).toMatch(/depois da criação/);
  });
});
