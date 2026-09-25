import { describe, it, expect } from "vitest";
import { textoDoAviso } from "./avisos";

describe("textoDoAviso", () => {
  it("leva o título da pendência e o link dela", () => {
    const t = textoDoAviso({ tipo: "pendencia", motivo: "nova", titulo: "Extrato de agosto", requestId: "abc" });
    expect(t.title).toBe("Nova pendência");
    expect(t.body).toBe("Extrato de agosto");
    expect(t.url).toBe("/portal/pendencias/abc");
  });

  it("distingue pendência nova, respondida e vencida", () => {
    const base = { tipo: "pendencia", titulo: "t", requestId: "1" } as const;
    expect(textoDoAviso({ ...base, motivo: "resposta" }).title).toBe("Resposta na pendência");
    expect(textoDoAviso({ ...base, motivo: "lembrete" }).title).toBe("Pendência vencida");
  });

  it("na conversa, diz a empresa e não o que foi escrito", () => {
    const t = textoDoAviso({ tipo: "mensagem", empresaNome: "ACME LTDA" });
    expect(t.body).toContain("ACME LTDA");
    expect(t.url).toBe("/portal/comunicacao");
  });

  it("no processo, leva o nome do processo e o link dele — nunca o que foi escrito", () => {
    const m = textoDoAviso({ tipo: "processo", motivo: "mensagem", processoNome: "Alteração contratual — ACME", processId: "p1" });
    expect(m.title).toBe("Nova mensagem no processo");
    expect(m.body).toBe("Alteração contratual — ACME");
    expect(m.url).toBe("/portal/processos/p1");
    const d = textoDoAviso({ tipo: "processo", motivo: "documento", processoNome: "x", processId: "p1" });
    expect(d.title).toBe("Novo documento no processo");
  });

  it("na aprovação, leva só a contagem — e concorda em número", () => {
    expect(textoDoAviso({ tipo: "aprovacao", quantidade: 1 }).title).toBe("Conta a pagar aguardando aprovação");
    expect(textoDoAviso({ tipo: "aprovacao", quantidade: 4 }).title).toBe("4 contas a pagar aguardando aprovação");
  });

  it("nenhum aviso cita valor", () => {
    const todos = [
      textoDoAviso({ tipo: "pendencia", motivo: "nova", titulo: "Extrato", requestId: "1" }),
      textoDoAviso({ tipo: "mensagem", empresaNome: "ACME" }),
      textoDoAviso({ tipo: "aprovacao", quantidade: 2 }),
    ];
    for (const t of todos) {
      expect(`${t.title} ${t.body}`).not.toMatch(/R\$/);
    }
  });

  it("todo aviso aponta para dentro do portal", () => {
    const todos = [
      textoDoAviso({ tipo: "pendencia", motivo: "lembrete", titulo: "t", requestId: "1" }),
      textoDoAviso({ tipo: "mensagem", empresaNome: "ACME" }),
      textoDoAviso({ tipo: "aprovacao", quantidade: 1 }),
    ];
    // O service worker abre a URL do payload; uma rota interna levaria o
    // cliente para o login da equipe.
    for (const t of todos) expect(t.url.startsWith("/portal/")).toBe(true);
  });
});
