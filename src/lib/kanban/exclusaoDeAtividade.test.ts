import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { throw new Error("o teste passa o banco falso"); } }));
const apagados: string[][] = [];
vi.mock("@/lib/exclusao/arquivos", async (original) => {
  const real = await original<typeof import("@/lib/exclusao/arquivos")>();
  return { ...real, apagarArquivos: vi.fn(async (a: { storage: { documents?: string[] } }) => { apagados.push(a.storage.documents ?? []); return 0; }) };
});

const { apagarAtividadeComAnexos, apagarTarefaComAtividades, subarvoreDoItem } = await import("./exclusaoDeAtividade");

// A tarefa pl1: raiz → a, b; a → a1; a1 → a11; e a "solta", sem filhas. Uma
// atividade de outra tarefa (pl2), com anexo, não pode sair.
type Item = { id: string; parentItemId: string | null; stageId: string; pipelineId: string };
const itens: Item[] = [
  { id: "raiz", parentItemId: null, stageId: "s", pipelineId: "pl1" }, { id: "a", parentItemId: "raiz", stageId: "s", pipelineId: "pl1" },
  { id: "b", parentItemId: "raiz", stageId: "s", pipelineId: "pl1" }, { id: "a1", parentItemId: "a", stageId: "s", pipelineId: "pl1" },
  { id: "a11", parentItemId: "a1", stageId: "s", pipelineId: "pl1" }, { id: "solta", parentItemId: null, stageId: "s", pipelineId: "pl1" },
  { id: "fora", parentItemId: null, stageId: "s", pipelineId: "pl2" },
];
const ANEXOS = [
  { entityId: "raiz", fileUrl: "t/raiz.pdf" }, { entityId: "a11", fileUrl: "t/a11.pdf" }, { entityId: "b", fileUrl: "t/b.png" }, { entityId: "fora", fileUrl: "t/fora.pdf" },
];

/** A cascata do `parentItemId`: some o item e tudo abaixo dele. */
function semAArvore(lista: Item[], ids: string[]): Item[] {
  const fora = new Set(ids);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const i of lista) if (i.parentItemId && fora.has(i.parentItemId) && !fora.has(i.id)) { fora.add(i.id); cresceu = true; }
  }
  return lista.filter((i) => !fora.has(i.id));
}

function bancoFalso(falharNaTransacao = false, anexos = ANEXOS, opcoes: { chegaUmaAtividade?: boolean } = {}) {
  const passos: string[] = [];
  let documentos = [...anexos];
  let restantes = [...itens];
  const naLista = (ids: string[]) => (d: { entityId: string }) => ids.includes(d.entityId);
  const db = {
    pipelineItem: {
      findMany: async ({ where }: { where: { parentItemId?: { in: string[] }; pipelineId?: string } }) => {
        if (where.parentItemId) return restantes.filter((i) => i.parentItemId && where.parentItemId!.in.includes(i.parentItemId));
        const daTarefa = restantes.filter((i) => i.pipelineId === where.pipelineId);
        // Alguém cria uma atividade entre a leitura e a transação.
        if (opcoes.chegaUmaAtividade) restantes = [...restantes, { id: "nova", parentItemId: null, stageId: "s", pipelineId: where.pipelineId! }];
        return daTarefa;
      },
      delete: async ({ where }: { where: { id: string } }) => { passos.push(`apaga ${where.id}`); restantes = semAArvore(restantes, [where.id]); },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => { passos.push(`apaga ${where.id.in.join(", ")}`); restantes = semAArvore(restantes, where.id.in); },
    },
    // A chave de PipelineItem para a tarefa é RESTRICT: com atividade, o banco recusa.
    pipeline: {
      delete: async ({ where }: { where: { id: string } }) => {
        if (restantes.some((i) => i.pipelineId === where.id)) throw new Error("chave estrangeira");
        passos.push(`apaga a tarefa ${where.id}`);
      },
    },
    document: {
      findMany: async ({ where }: { where: { entityId: { in: string[] } } }) => documentos.filter(naLista(where.entityId.in)),
      deleteMany: async ({ where }: { where: { entityType: string; entityId: { in: string[] } } }) => { passos.push(`apaga documentos de ${where.entityType}`); documentos = documentos.filter((d) => !naLista(where.entityId.in)(d)); },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const antes = { documentos, restantes };
      try { const r = await fn(db); if (falharNaTransacao) throw new Error("caiu"); passos.push("commit"); return r; }
      catch (err) { documentos = antes.documentos; restantes = antes.restantes; throw err; }
    },
  };
  return { db, passos, documentos: () => documentos, restantes: () => restantes };
}

beforeEach(() => { apagados.length = 0; });

describe("subarvoreDoItem", () => {
  it("todos os níveis abaixo, sem a própria raiz nem quem é de fora", async () => {
    const { db } = bancoFalso();
    expect((await subarvoreDoItem("t", "raiz", db as never)).map((s) => s.id).sort()).toEqual(["a", "a1", "a11", "b"]);
  });
});

describe("apagarAtividadeComAnexos", () => {
  it("apaga os anexos da árvore inteira e só tira os arquivos do disco depois do commit", async () => {
    const { db, passos, documentos } = bancoFalso();
    const junto = vi.fn(async () => { passos.push("obrigação"); });
    const r = await apagarAtividadeComAnexos("t", "raiz", junto, db as never);
    expect(r).toEqual({ subatividades: 4, anexos: 3, arquivosQueFicaram: 0 });
    expect(passos).toEqual(["apaga documentos de PIPELINE_ITEM", "obrigação", "apaga raiz", "commit"]);
    expect(apagados).toEqual([["t/raiz.pdf", "t/a11.pdf", "t/b.png"]]);
    expect(documentos()).toEqual([{ entityId: "fora", fileUrl: "t/fora.pdf" }]);
  });

  it("se a transação cai, nenhum arquivo sai do disco", async () => {
    const { db } = bancoFalso(true);
    await expect(apagarAtividadeComAnexos("t", "raiz", undefined, db as never)).rejects.toThrow("caiu");
    expect(apagados).toEqual([]);
  });

  it("sem anexo na árvore, não chama o disco", async () => {
    const { db } = bancoFalso(false, [{ entityId: "fora", fileUrl: "t/fora.pdf" }]);
    expect(await apagarAtividadeComAnexos("t", "a", undefined, db as never)).toEqual({ subatividades: 2, anexos: 0, arquivosQueFicaram: 0 });
    expect(apagados).toEqual([]);
  });
});

describe("apagarTarefaComAtividades — a tarefa com tudo o que tem dentro (10/11/2026)", () => {
  it("conta a árvore, apaga os anexos de todos os níveis e a tarefa, e só tira os arquivos do disco depois do commit", async () => {
    const { db, passos, documentos, restantes } = bancoFalso();
    const r = await apagarTarefaComAtividades("t", "pl1", db as never);
    expect(r).toEqual({ atividades: 2, subatividades: 4, anexos: 3, arquivosQueFicaram: 0 });
    // As de cima pelo id; a cascata leva as subatividades.
    expect(passos).toEqual(["apaga documentos de PIPELINE_ITEM", "apaga raiz, solta", "apaga a tarefa pl1", "commit"]);
    expect(apagados).toEqual([["t/raiz.pdf", "t/a11.pdf", "t/b.png"]]);
    expect(documentos()).toEqual([{ entityId: "fora", fileUrl: "t/fora.pdf" }]);
    expect(restantes().map((i) => i.id)).toEqual(["fora"]);
  });

  it("se a transação cai, nada sai do banco nem do disco", async () => {
    const { db, documentos, restantes } = bancoFalso(true);
    await expect(apagarTarefaComAtividades("t", "pl1", db as never)).rejects.toThrow("caiu");
    expect(apagados).toEqual([]);
    expect(documentos()).toHaveLength(4);
    expect(restantes()).toHaveLength(7);
  });

  it("atividade criada no meio do caminho: o banco recusa a tarefa, e a transação inteira volta", async () => {
    const { db, documentos, restantes } = bancoFalso(false, ANEXOS, { chegaUmaAtividade: true });
    await expect(apagarTarefaComAtividades("t", "pl1", db as never)).rejects.toThrow("chave estrangeira");
    expect(apagados).toEqual([]);
    expect(documentos()).toHaveLength(4);
    expect(restantes().map((i) => i.id)).toContain("raiz");
  });

  it("tarefa vazia: sai só ela, sem procurar anexo nem chamar o disco", async () => {
    const { db, passos } = bancoFalso();
    expect(await apagarTarefaComAtividades("t", "pl3", db as never)).toEqual({ atividades: 0, subatividades: 0, anexos: 0, arquivosQueFicaram: 0 });
    expect(passos).toEqual(["apaga a tarefa pl3", "commit"]);
    expect(apagados).toEqual([]);
  });
});
