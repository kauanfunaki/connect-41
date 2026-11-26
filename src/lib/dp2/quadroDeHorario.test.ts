import { describe, expect, it } from "vitest";
import { descansoDoHorario, linhasDoQuadro, pdfDoQuadroDeHorario } from "./quadroDeHorario";

const comercial = { nome: "Comercial", dias: "1111100", entrada: "08:00", saida: "17:48", intervaloMinutos: 60, tipoJornada: "9" };

describe("quadro de horário", () => {
  it("o descanso semanal são os dias sem trabalho", () => {
    expect(descansoDoHorario("1111100")).toBe("Sábado e domingo");
    expect(descansoDoHorario("1111110")).toBe("Domingo");
    expect(descansoDoHorario("1111111")).toBe("Escala (sem folga fixa)");
  });

  it("monta as linhas por nome e separa quem não tem horário", () => {
    const q = linhasDoQuadro([
      { nome: "Zélia", cargo: null, horario: null },
      { nome: "Joana", cargo: "Padeira", horario: comercial },
      { nome: "Ana", cargo: null, horario: { ...comercial, dias: "1111111", tipoJornada: "2", entrada: "19:00", saida: "07:00" } },
    ]);
    expect(q.semHorario).toEqual(["Zélia"]);
    expect(q.linhas.map((l) => l.nome)).toEqual(["Ana", "Joana"]);
    expect(q.linhas[1]).toEqual({ nome: "Joana", cargo: "Padeira", dias: "Segunda a sexta", entrada: "08:00", saida: "17:48", intervalo: "1 h", descanso: "Sábado e domingo", semanais: "44 h" });
    expect(q.linhas[0].descanso).toBe("12 x 36");
  });

  it("sai em PDF, com várias páginas quando precisa", async () => {
    const pessoas = Array.from({ length: 60 }, (_, i) => ({ nome: `Pessoa ${i}`, cargo: null, horario: comercial }));
    const pdf = await pdfDoQuadroDeHorario(linhasDoQuadro(pessoas), { empresa: "Panificadora", documento: null, endereco: null, cidade: "Curitiba", data: "2026-11-26" });
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(1);
  });
});
