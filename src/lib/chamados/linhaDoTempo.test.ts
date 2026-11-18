import { describe, expect, it } from "vitest";
import { agruparLinha, descreverEvento, montarLinhaDoTempo, rotuloDoBloco, tamanhoDoArquivo } from "./linhaDoTempo";

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
  it("descreve o fim da triagem pelo resultado", () => {
    const robo = { ref: "robo:x", tipo: "robo", nome: "Robô fictício", responsavel: null, endereco: null, noOps: null, detalhe: null, match: "same", reason: "Faz a mesma conversão." };
    expect(descreverEvento({ type: "triagem", actorId: null, data: { existente: robo, categoria: "Desenvolvimento › Nova Automação" } }, nome)).toEqual({ texto: "A triagem automática encontrou no Orquestrador o robô Robô fictício e classificou o chamado em Desenvolvimento › Nova Automação", detalhe: "Faz a mesma conversão." });
    expect(descreverEvento({ type: "triagem", actorId: null, data: { existente: robo, semCategoria: "falha" } }, nome).texto).toBe("A triagem automática encontrou no Orquestrador o robô Robô fictício e deixou a classificação para a equipe");
    expect(descreverEvento({ type: "triagem", actorId: null, data: { categoria: "Suporte › Treinamento", confirmadaPorQuemAbriu: true } }, nome).texto).toBe("A triagem manteve a categoria Suporte › Treinamento, confirmada por quem abriu");
    expect(descreverEvento({ type: "triagem", actorId: null, data: { existente: robo, categoria: "Suporte › Treinamento", confirmadaPorQuemAbriu: true } }, nome).texto).toBe("A triagem automática encontrou no Orquestrador o robô Robô fictício e manteve a categoria Suporte › Treinamento, confirmada por quem abriu");
    expect(descreverEvento({ type: "triagem", actorId: null, data: { categoria: "Suporte › Treinamento" } }, nome).texto).toBe("A triagem automática classificou o chamado em Suporte › Treinamento");
    const semCategoria = descreverEvento({ type: "triagem", actorId: null, data: { semCategoria: "falha" } }, nome);
    expect(semCategoria.texto).toBe("A triagem automática deixou o chamado para a equipe classificar"); expect(semCategoria.detalhe).toContain("falhou");
    expect(descreverEvento({ type: "created", actorId: "ana", data: { triagem: true } }, nome).texto).toBe("Ana abriu o chamado");
  });
  it("mostra o tamanho do arquivo", () => {
    expect(tamanhoDoArquivo(512)).toBe("512 B");
    expect(tamanhoDoArquivo(2048)).toBe("2 KB");
    expect(tamanhoDoArquivo(1.5 * 1024 * 1024)).toBe("1,5 MB");
  });
});

// Os tipos de envio para outro setor (16/11/2026, funcionalidade-709).
describe("envio para outro setor na linha do tempo", () => {
  const nome = (id: string) => ({ ana: "Ana" } as Record<string, string>)[id] ?? id;
  const setor = (data: Record<string, unknown>, actorId: string | null = "ana") => descreverEvento({ type: "setor", actorId, data: { from: "tech", to: "dp", fromLabel: "Tech", toLabel: "DP", ...data } }, nome);
  it("diz se foi para continuar, para corrigir, pela triagem ou do jeito antigo", () => {
    expect(setor({ tipo: "continuar", motivo: "Emitir a guia." })).toEqual({ texto: "Ana encaminhou o chamado de Tech para DP continuar", detalhe: "Emitir a guia." });
    expect(setor({ tipo: "corrigir" }).texto).toBe("Ana corrigiu o setor do chamado de Tech para DP");
    expect(setor({ pelaTriagem: true }, null).texto).toBe("A triagem automática enviou o chamado para DP");
    expect(setor({}).texto).toBe("Ana redirecionou o chamado de Tech para DP");
  });
});

describe("eventos recolhidos na conversa (melhoria-782)", () => {
  const ev = (id: string, at: string, internal = false) => ({ id, type: "status", actorId: "ana", data: { to: "EM_ANDAMENTO" }, internal, createdAt: at });
  const msg = (id: string, at: string) => ({ id, authorId: "bia", body: "Oi", internal: false, createdAt: at });
  const itens = montarLinhaDoTempo({
    mensagens: [msg("m1", "2026-11-18T10:00:00Z"), msg("m2", "2026-11-18T12:00:00Z")],
    anexos: [anexo("a1", null, "2026-11-18T13:00:00Z")],
    eventos: [ev("e1", "2026-11-18T09:00:00Z"), ev("e2", "2026-11-18T09:01:00Z"), ev("e3", "2026-11-18T09:02:00Z"), ev("e4", "2026-11-18T11:00:00Z"), ev("e5", "2026-11-18T14:00:00Z", true), ev("e6", "2026-11-18T14:01:00Z", true)],
  });
  const resumo = (blocos: ReturnType<typeof agruparLinha>) => blocos.map(b => b.tipo === "eventos" ? `[${b.eventos.map(e => e.id).join(",")}]` : b.item.id);
  it("junta dois ou mais eventos seguidos e deixa o evento sozinho como está", () => {
    expect(resumo(agruparLinha(itens))).toEqual(["[e1,e2,e3]", "m1", "e4", "m2", "a1", "[e5,e6]"]);
  });
  it("só mensagens tira os eventos e deixa mensagens e arquivos", () => {
    expect(resumo(agruparLinha(itens, { soMensagens: true }))).toEqual(["m1", "m2", "a1"]);
  });
  it("conta as alterações e diz quando são todas internas", () => {
    expect(rotuloDoBloco([{ internal: false }, { internal: true }, { internal: false }])).toBe("3 alterações");
    expect(rotuloDoBloco([{ internal: true }, { internal: true }])).toBe("2 alterações internas");
  });
});
