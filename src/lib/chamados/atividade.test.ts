import { describe, expect, it } from "vitest";
import { atividadesRecentes, idadeDaAtividade, papelDoAutor, prazoRelativo, type Autoria } from "./atividade";

const nome = (id: string) => ({ ana: "Ana", bia: "Bia", caio: "Caio" })[id] ?? "Usuário indisponível";
const autoria: Autoria = { createdById: "ana", responsaveis: ["bia"], equipe: new Set(["bia", "caio"]) };
const evento = (id: string, type: string, actorId: string | null, data: unknown = {}, internal = false) => ({ id, type, actorId, data, internal, createdAt: "2026-11-03T13:12:00Z" });

describe("atividade recente na lista de chamados", () => {
  it("dá o papel de quem agiu", () => {
    expect(papelDoAutor("ana", autoria)).toBe("Requerente");
    expect(papelDoAutor("bia", autoria)).toBe("Suporte");
    expect(papelDoAutor("caio", autoria)).toBe("Suporte");
    expect(papelDoAutor("dora", autoria)).toBe("Usuário");
    // Quem abriu continua Requerente, mesmo sendo da equipe.
    expect(papelDoAutor("bia", { ...autoria, createdById: "bia" })).toBe("Requerente");
  });
  it("troca o nome pelo papel só no sujeito da frase", () => {
    const [aberto, assumido, definidos] = atividadesRecentes([
      evento("e1", "created", "ana"),
      evento("e2", "assignees", "bia", { assumiu: true }),
      evento("e3", "assignees", "caio", { userIds: ["bia", "caio"] }),
    ], autoria, nome, new Map());
    expect(aberto.texto).toBe("Requerente abriu o chamado");
    expect(assumido.texto).toBe("Suporte assumiu o chamado");
    expect(definidos.texto).toBe("Suporte definiu os responsáveis: Bia, Caio");
  });
  it("leva o comentário resumido para a dica", () => {
    const longo = `Pode anexar   o XML?\n\n${"x".repeat(400)}`;
    const [curto, cortado, interno, sumido] = atividadesRecentes([
      evento("e1", "comment", "bia", { commentId: "c1" }),
      evento("e2", "comment", "ana", { commentId: "c2" }),
      evento("e3", "comment", "caio", { commentId: "c3" }, true),
      evento("e4", "comment", "bia", { commentId: "c9" }),
    ], autoria, nome, new Map([["c1", "  Pode anexar o XML?  "], ["c2", longo], ["c3", "Ver com o fiscal"]]));
    expect(curto).toMatchObject({ texto: "Suporte comentou", comentario: "Pode anexar o XML?" });
    expect(cortado.texto).toBe("Requerente comentou");
    expect(cortado.comentario).toHaveLength(280);
    expect(cortado.comentario?.startsWith("Pode anexar o XML? x")).toBe(true);
    expect(cortado.comentario?.endsWith("…")).toBe(true);
    expect(interno).toMatchObject({ texto: "Suporte deixou uma nota interna", comentario: "Ver com o fiscal" });
    expect(sumido.comentario).toBeUndefined();
  });
  it("dá o tom pela idade da última atividade", () => {
    const agora = new Date("2026-11-03T15:00:00Z");
    expect(idadeDaAtividade(new Date("2026-11-03T13:00:00Z"), agora)).toBe("recente");
    expect(idadeDaAtividade(new Date("2026-11-01T15:00:00Z"), agora)).toBe("normal");
    expect(idadeDaAtividade(new Date("2026-10-29T15:00:00Z"), agora)).toBe("parada");
  });
  it("diz o prazo em dias do escritório", () => {
    const agora = new Date("2026-11-03T15:00:00Z"); // 12:00 em São Paulo
    expect(prazoRelativo(new Date("2026-11-10T20:59:00Z"), agora)).toBe("em 7 dias");
    expect(prazoRelativo(new Date("2026-11-04T02:00:00Z"), agora)).toBe("hoje"); // 23:00 do dia 03 em São Paulo
    expect(prazoRelativo(new Date("2026-11-03T12:00:00Z"), agora)).toBe("venceu hoje");
    expect(prazoRelativo(new Date("2026-11-04T12:00:00Z"), agora)).toBe("amanhã");
    expect(prazoRelativo(new Date("2026-11-02T12:00:00Z"), agora)).toBe("venceu ontem");
    expect(prazoRelativo(new Date("2026-10-31T12:00:00Z"), agora)).toBe("venceu há 3 dias");
  });
  it("evento do sistema segue sem papel", () => {
    expect(atividadesRecentes([evento("e1", "sla", null)], autoria, nome, new Map())[0].texto).toBe("O prazo de atendimento venceu");
  });
});
