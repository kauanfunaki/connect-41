import { describe, expect, it } from "vitest";
import { assuntoDoAviso, corpoDoAviso, dataBr } from "./emailDeVencimento";
import type { ItemDoAviso } from "./avisoDeVencimento";

const item = (extra: Partial<ItemDoAviso>): ItemDoAviso => ({
  chave: "k",
  empresa: "Empresa Exemplo",
  cnpj: "11.222.333/0001-81",
  documento: "Alvará de funcionamento",
  vence: "2026-12-12",
  situacao: "vence em 30 dias",
  gravidade: "perto",
  ...extra,
});

describe("o e-mail de vencimentos", () => {
  it("assunto com a contagem e as vencidas à parte", () => {
    expect(assuntoDoAviso([item({})], false)).toBe("Societário: 1 documento vencendo ou vencido");
    expect(assuntoDoAviso([item({}), item({ gravidade: "vencida" })], false)).toBe(
      "Societário: 2 documentos vencendo ou vencidos (1 já vencido ou positivo)"
    );
    expect(assuntoDoAviso([item({})], true)).toMatch(/^\[Teste\] /);
  });

  it("uma linha por item, com a data em dd/mm/aaaa e o texto escapado", () => {
    const html = corpoDoAviso([item({ empresa: "A & B <Ltda>" })], { hoje: "2026-11-12", linkDaTela: "https://x/licencas", previa: false });
    expect(html).toContain("A &amp; B &lt;Ltda&gt;");
    expect(html).toContain("12/12/2026");
    expect(html).toContain("12/11/2026");
    expect(html).toContain('href="https://x/licencas"');
    expect(html).not.toContain("e-mail de teste");
  });

  it("o teste diz que não marca nada como avisado", () => {
    expect(corpoDoAviso([item({})], { hoje: "2026-11-12", linkDaTela: "", previa: true })).toContain("não marca nada como avisado");
  });

  it("certidão positiva sem validade aparece com traço", () => {
    expect(dataBr(null)).toBe("—");
  });
});
