import { describe, expect, it } from "vitest";
import {
  transicao,
  situacaoDoPrazo,
  emAndamento,
  validarCamposDaPendencia,
  validarResposta,
  type StatusDaPendencia,
} from "./regras";

describe("transicao", () => {
  it("resposta do cliente passa a vez para a equipe", () => {
    expect(transicao("ABERTA", "CLIENTE", "RESPONDER")).toEqual({ ok: true, novo: "RESPONDIDA" });
    expect(transicao("RESPONDIDA", "CLIENTE", "RESPONDER")).toEqual({ ok: true, novo: "RESPONDIDA" });
  });

  it("resposta da equipe devolve a vez ao cliente", () => {
    expect(transicao("RESPONDIDA", "EQUIPE", "RESPONDER")).toEqual({ ok: true, novo: "ABERTA" });
    expect(transicao("ABERTA", "EQUIPE", "RESPONDER")).toEqual({ ok: true, novo: "ABERTA" });
  });

  it("ninguém responde pendência encerrada", () => {
    for (const status of ["RESOLVIDA", "CANCELADA"] as StatusDaPendencia[]) {
      expect(transicao(status, "CLIENTE", "RESPONDER").ok).toBe(false);
      expect(transicao(status, "EQUIPE", "RESPONDER").ok).toBe(false);
    }
  });

  it("equipe resolve e cancela o que está em andamento", () => {
    expect(transicao("ABERTA", "EQUIPE", "RESOLVER")).toEqual({ ok: true, novo: "RESOLVIDA" });
    expect(transicao("RESPONDIDA", "EQUIPE", "RESOLVER")).toEqual({ ok: true, novo: "RESOLVIDA" });
    expect(transicao("ABERTA", "EQUIPE", "CANCELAR")).toEqual({ ok: true, novo: "CANCELADA" });
    expect(transicao("RESPONDIDA", "EQUIPE", "CANCELAR")).toEqual({ ok: true, novo: "CANCELADA" });
  });

  it("não resolve nem cancela o que já está encerrado", () => {
    expect(transicao("RESOLVIDA", "EQUIPE", "RESOLVER").ok).toBe(false);
    expect(transicao("CANCELADA", "EQUIPE", "CANCELAR").ok).toBe(false);
    expect(transicao("RESOLVIDA", "EQUIPE", "CANCELAR").ok).toBe(false);
  });

  it("equipe reabre resolvida ou cancelada, e só elas", () => {
    expect(transicao("RESOLVIDA", "EQUIPE", "REABRIR")).toEqual({ ok: true, novo: "ABERTA" });
    expect(transicao("CANCELADA", "EQUIPE", "REABRIR")).toEqual({ ok: true, novo: "ABERTA" });
    expect(transicao("ABERTA", "EQUIPE", "REABRIR").ok).toBe(false);
    expect(transicao("RESPONDIDA", "EQUIPE", "REABRIR").ok).toBe(false);
  });

  it("cliente não resolve, não cancela e não reabre", () => {
    for (const status of ["ABERTA", "RESPONDIDA", "RESOLVIDA", "CANCELADA"] as StatusDaPendencia[]) {
      expect(transicao(status, "CLIENTE", "RESOLVER").ok).toBe(false);
      expect(transicao(status, "CLIENTE", "CANCELAR").ok).toBe(false);
      expect(transicao(status, "CLIENTE", "REABRIR").ok).toBe(false);
    }
  });

  it("emAndamento só para aberta e respondida", () => {
    expect(emAndamento("ABERTA")).toBe(true);
    expect(emAndamento("RESPONDIDA")).toBe(true);
    expect(emAndamento("RESOLVIDA")).toBe(false);
    expect(emAndamento("CANCELADA")).toBe(false);
  });
});

describe("situacaoDoPrazo", () => {
  // Prazo gravado como a tela grava: meio-dia UTC do dia civil.
  const dia10 = new Date(Date.UTC(2026, 8, 10, 12));

  it("sem prazo", () => {
    expect(situacaoDoPrazo(null, new Date())).toBe("SEM_PRAZO");
  });

  it("vence hoje durante o dia inteiro em São Paulo", () => {
    expect(situacaoDoPrazo(dia10, new Date("2026-09-10T00:05:00-03:00"))).toBe("VENCE_HOJE");
    expect(situacaoDoPrazo(dia10, new Date("2026-09-10T23:50:00-03:00"))).toBe("VENCE_HOJE");
  });

  it("às 22h do dia 9 em Brasília (já dia 10 em UTC) ainda está no prazo", () => {
    expect(situacaoDoPrazo(dia10, new Date("2026-09-09T22:00:00-03:00"))).toBe("NO_PRAZO");
  });

  it("vencida a partir da meia-noite do dia seguinte em São Paulo", () => {
    expect(situacaoDoPrazo(dia10, new Date("2026-09-11T00:01:00-03:00"))).toBe("VENCIDA");
    // 02h UTC do dia 11 ainda é dia 10 em Brasília.
    expect(situacaoDoPrazo(dia10, new Date("2026-09-11T02:00:00Z"))).toBe("VENCE_HOJE");
  });
});

describe("validarCamposDaPendencia", () => {
  const base = { kind: "DOCUMENTO", title: "Extrato de agosto", description: "", dueDate: "2026-09-20" };

  it("aceita e grava o prazo ao meio-dia UTC", () => {
    const r = validarCamposDaPendencia(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dados.dueDate?.toISOString()).toBe("2026-09-20T12:00:00.000Z");
      expect(r.dados.description).toBeNull();
    }
  });

  it("prazo é opcional", () => {
    const r = validarCamposDaPendencia({ ...base, dueDate: "" });
    expect(r.ok && r.dados.dueDate).toBe(null);
  });

  it("recusa tipo desconhecido, título curto ou longo e data inexistente", () => {
    expect(validarCamposDaPendencia({ ...base, kind: "OUTRO" }).ok).toBe(false);
    expect(validarCamposDaPendencia({ ...base, title: " a " }).ok).toBe(false);
    expect(validarCamposDaPendencia({ ...base, title: "x".repeat(161) }).ok).toBe(false);
    expect(validarCamposDaPendencia({ ...base, dueDate: "2026-02-30" }).ok).toBe(false);
  });

  it("junta espaços do título", () => {
    const r = validarCamposDaPendencia({ ...base, title: "  Nota   de  compra " });
    expect(r.ok && r.dados.title).toBe("Nota de compra");
  });
});

describe("validarResposta", () => {
  it("exige texto ou anexo", () => {
    expect(validarResposta("   ", 0).ok).toBe(false);
    expect(validarResposta("", 1)).toEqual({ ok: true, corpo: "" });
    expect(validarResposta(" segue ", 0)).toEqual({ ok: true, corpo: "segue" });
  });

  it("recusa mensagem longa demais", () => {
    expect(validarResposta("x".repeat(5_001), 0).ok).toBe(false);
  });
});
