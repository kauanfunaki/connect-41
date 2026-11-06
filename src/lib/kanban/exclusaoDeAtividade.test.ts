import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => { throw new Error("o teste passa o banco falso"); } }));
const apagados: string[][] = [];
vi.mock("@/lib/exclusao/arquivos", async (original) => {
  const real = await original<typeof import("@/lib/exclusao/arquivos")>();
  return { ...real, apagarArquivos: vi.fn(async (a: { storage: { documents?: string[] } }) => { apagados.push(a.storage.documents ?? []); return 0; }) };
});

const { apagarAtividadeComAnexos, subarvoreDoItem } = await import("./exclusaoDeAtividade");

// A árvore: raiz → a, b; a → a1; a1 → a11. Uma atividade de fora, com anexo, não pode sair.
const itens = [
  { id: "raiz", parentItemId: null, stageId: "s" }, { id: "a", parentItemId: "raiz", stageId: "s" }, { id: "b", parentItemId: "raiz", stageId: "s" },
  { id: "a1", parentItemId: "a", stageId: "s" }, { id: "a11", parentItemId: "a1", stageId: "s" }, { id: "fora", parentItemId: null, stageId: "s" },
];
const ANEXOS = [
  { entityId: "raiz", fileUrl: "t/raiz.pdf" }, { entityId: "a11", fileUrl: "t/a11.pdf" }, { entityId: "b", fileUrl: "t/b.png" }, { entityId: "fora", fileUrl: "t/fora.pdf" },
];
function bancoFalso(falharNaTransacao = false, anexos = ANEXOS) {
  const passos: string[] = [];
  let documentos = [...anexos];
  let restantes = [...itens];
  const naLista = (ids: string[]) => (d: { entityId: string }) => ids.includes(d.entityId);
  const db = {
    pipelineItem: {
      findMany: async ({ where }: { where: { parentItemId: { in: string[] } } }) => restantes.filter((i) => i.parentItemId && where.parentItemId.in.includes(i.parentItemId)),
      delete: async ({ where }: { where: { id: string } }) => { passos.push(`apaga ${where.id}`); restantes = restantes.filter((i) => i.id !== where.id); },
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
  return { db, passos, documentos: () => documentos };
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
    expect(passos).toEqual(["obrigação", "apaga documentos de PIPELINE_ITEM", "apaga raiz", "commit"]);
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
