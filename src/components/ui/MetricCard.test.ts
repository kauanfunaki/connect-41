import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

// Observação do Kauan no item das Certidões (09/11/2026): no "Gasto no mês",
// o "mínimo de R$ 100,00 no mês" saía cortado no fim do detalhe.
describe("MetricCard — o detalhe não corta numa linha só", () => {
  it("quebra em até duas linhas, sem o corte com reticências", async () => {
    const { MetricCard } = await import("./MetricCard");
    const detalhe = "18 consultas · teto de R$ 300,00 · mínimo de R$ 100,00 no mês";
    const html = renderToStaticMarkup(React.createElement(MetricCard, { label: "Gasto no mês", value: "R$ 4,86", detalhe }));
    const p = [...html.matchAll(/<p class="([^"]*)">([^<]*)<\/p>/g)].find((m) => m[2] === detalhe);
    expect(p).toBeDefined();
    const classes = p![1]!.split(" ");
    expect(classes).toContain("line-clamp-2");
    expect(classes).not.toContain("truncate");
  });
});
