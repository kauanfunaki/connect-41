import { describe, expect, it } from "vitest";
import { ordenarFila, textoDoPrazoEmDias, type ItemDaFila } from "./painelDoSetor";

// O painel do Societário (04/11/2026, lote D dos ajustes de 03/11).

const item = (p: Partial<ItemDaFila> & Pick<ItemDaFila, "chave" | "tipo">): ItemDaFila => ({
  titulo: p.chave,
  detalhe: "",
  selo: "",
  tom: "atencao",
  href: "/",
  peso: 0,
  ...p,
});

describe("a fila do dia", () => {
  it("parado e exigência vencida primeiro; depois estourado, exigência da semana, licença vencida, certidão e licença a renovar", () => {
    const fila = ordenarFila([
      item({ chave: "licenca-renovar", tipo: "licenca", peso: 20 }),
      item({ chave: "certidao", tipo: "certidao" }),
      item({ chave: "licenca-vencida", tipo: "licenca", peso: -3, urgente: true }),
      item({ chave: "exigencia-semana", tipo: "exigencia", peso: 4 }),
      item({ chave: "estourado", tipo: "estourado", peso: 2 }),
      item({ chave: "exigencia-hoje", tipo: "exigencia", peso: 0, urgente: true }),
      item({ chave: "parado-17", tipo: "parado", peso: 17 }),
      item({ chave: "parado-25", tipo: "parado", peso: 25 }),
    ]);
    expect(fila.map((i) => i.chave)).toEqual([
      "parado-25",
      "parado-17",
      "exigencia-hoje",
      "estourado",
      "exigencia-semana",
      "licenca-vencida",
      "certidao",
      "licenca-renovar",
    ]);
  });

  it("o prazo em dias", () => {
    expect(textoDoPrazoEmDias(0)).toBe("vence hoje");
    expect(textoDoPrazoEmDias(1)).toBe("vence em 1 dia");
    expect(textoDoPrazoEmDias(5)).toBe("vence em 5 dias");
    expect(textoDoPrazoEmDias(-1)).toBe("venceu há 1 dia");
    expect(textoDoPrazoEmDias(-4)).toBe("venceu há 4 dias");
  });
});
