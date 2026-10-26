import { describe, expect, it } from "vitest";
import { descreverEvento, montarLinhaDoTempo, tamanhoDoArquivo } from "./linhaDoTempo";

const nome = (id: string) => ({ ana: "Ana", bia: "Bia" })[id] ?? "Usuário indisponível";
const anexo = (id: string, commentId: string | null, createdAt: string) => ({ id, fileName: `${id}.pdf`, mimeType: "application/pdf", sizeBytes: 10, internal: false, commentId, uploadedById: "ana", createdAt });

describe("linha do tempo do chamado", () => {
  it("ordena mensagens, arquivos e eventos sem repetir o evento da mensagem", () => {
    const itens = montarLinhaDoTempo({
      mensagens: [{ id: "m1", authorId: "ana", body: "Olá", internal: false, createdAt: "2026-10-26T10:00:00Z" }],
      anexos: [anexo("a1", "m1", "2026-10-26T09:59:59Z"), anexo("a2", null, "2026-10-26T11:00:00Z")],
      eventos: [
        { id: "e1", type: "comment", actorId: "ana", data: { commentId: "m1" }, internal: false, createdAt: "2026-10-26T10:00:00Z" },
        { id: "e2", type: "attachment", actorId: "ana", data: {}, internal: false, createdAt: "2026-10-26T11:00:00Z" },
        { id: "e3", type: "status", actorId: "bia", data: { to: "EM_ANDAMENTO" }, internal: false, createdAt: "2026-10-26T09:00:00Z" },
      ],
    });
    expect(itens.map(i => `${i.tipo}:${i.id}`)).toEqual(["evento:e3", "mensagem:m1", "anexo:a2"]);
    expect(itens[1].tipo === "mensagem" && itens[1].anexos.map(a => a.id)).toEqual(["a1"]);
  });
  it("descreve quem fez e o quê", () => {
    expect(descreverEvento({ type: "status", actorId: "ana", data: { to: "EM_ANDAMENTO" } }, nome).texto).toBe("Ana alterou a situação para Em andamento");
    expect(descreverEvento({ type: "assignees", actorId: "ana", data: { userIds: ["ana", "bia"] } }, nome).texto).toBe("Ana definiu os responsáveis: Ana, Bia");
    expect(descreverEvento({ type: "assignees", actorId: "bia", data: {} }, nome).texto).toBe("Bia alterou os responsáveis");
    expect(descreverEvento({ type: "assignees", actorId: "bia", data: { assumiu: true } }, nome).texto).toBe("Bia assumiu o chamado");
    expect(descreverEvento({ type: "deadline", actorId: "ana", data: { motivo: "Depende do fornecedor" } }, nome).detalhe).toBe("Depende do fornecedor");
    expect(descreverEvento({ type: "sla", actorId: null, data: {} }, nome).texto).toBe("O prazo de atendimento venceu");
  });
  it("mostra o tamanho do arquivo", () => {
    expect(tamanhoDoArquivo(512)).toBe("512 B");
    expect(tamanhoDoArquivo(2048)).toBe("2 KB");
    expect(tamanhoDoArquivo(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});
