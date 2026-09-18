import { describe, expect, it } from "vitest";
import { ordenarConversas, previa, resumirConversa, type MensagemDaConversa } from "./regras";

function msg(lado: "EQUIPE" | "CLIENTE", corpo: string, minuto: number, anexos = 0): MensagemDaConversa {
  return {
    id: `${lado}-${minuto}`,
    lado,
    autorNome: lado === "CLIENTE" ? "Cliente" : "Equipe",
    corpo,
    criadaEm: new Date(`2026-09-18T10:${String(minuto).padStart(2, "0")}:00Z`),
    anexos: Array.from({ length: anexos }, (_, i) => ({ id: `a${i}`, fileName: `arquivo-${i}.pdf`, sizeBytes: 10 })),
  };
}

describe("resumirConversa", () => {
  it("o cliente falando por último deixa a bola com o escritório", () => {
    const r = resumirConversa([msg("EQUIPE", "Bom dia", 1), msg("CLIENTE", "Segue o extrato", 2, 1)]);
    expect(r.esperandoEscritorio).toBe(true);
    expect(r.ultima?.corpo).toBe("Segue o extrato");
    expect(r.mensagens).toBe(2);
    expect(r.anexos).toBe(1);
  });

  it("o escritório falando por último tira a bola dele", () => {
    expect(resumirConversa([msg("CLIENTE", "Oi", 1), msg("EQUIPE", "Recebido", 2)]).esperandoEscritorio).toBe(false);
  });

  it("conversa vazia não espera ninguém", () => {
    expect(resumirConversa([])).toMatchObject({ ultima: null, mensagens: 0, esperandoEscritorio: false });
  });
});

describe("ordenarConversas", () => {
  it("quem espera o escritório vem primeiro, e a mais parada no topo", () => {
    const itens = [
      { empresaNome: "Beta", resumo: resumirConversa([msg("EQUIPE", "ok", 9)]) },
      { empresaNome: "Alfa", resumo: resumirConversa([msg("CLIENTE", "mais nova", 8)]) },
      { empresaNome: "Gama", resumo: resumirConversa([msg("CLIENTE", "mais velha", 1)]) },
    ];
    expect(ordenarConversas(itens).map((i) => i.empresaNome)).toEqual(["Gama", "Alfa", "Beta"]);
  });

  it("entre as que não esperam, a conversa mais recente vem antes", () => {
    const itens = [
      { empresaNome: "Antiga", resumo: resumirConversa([msg("EQUIPE", "a", 1)]) },
      { empresaNome: "Recente", resumo: resumirConversa([msg("EQUIPE", "b", 5)]) },
    ];
    expect(ordenarConversas(itens).map((i) => i.empresaNome)).toEqual(["Recente", "Antiga"]);
  });
});

describe("previa", () => {
  it("junta as quebras de linha e corta o que passa do limite", () => {
    expect(previa("linha um\n\n  linha dois ")).toBe("linha um linha dois");
    expect(previa("a".repeat(200))).toHaveLength(120);
    expect(previa("a".repeat(200)).endsWith("…")).toBe(true);
  });
});
