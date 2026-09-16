import { describe, expect, it } from "vitest";
import {
  podeEditarVersao,
  podeReabrir,
  planoDeAprovacao,
  versaoAprovada,
  versaoPadrao,
  validarNomeDaVersao,
  lerAno,
  type VersaoDoOrcamento,
} from "./versoes";

const v = (id: string, status: VersaoDoOrcamento["status"], approvedAt: string | null, updatedAt = "2026-01-01"): VersaoDoOrcamento => ({
  id,
  status,
  approvedAt: approvedAt ? new Date(approvedAt) : null,
  updatedAt: new Date(updatedAt),
});

describe("edição e reabertura", () => {
  it("rascunho edita; aprovada é somente leitura e só ela reabre", () => {
    expect(podeEditarVersao("RASCUNHO").pode).toBe(true);
    expect(podeEditarVersao("APROVADO").pode).toBe(false);
    expect(podeReabrir("APROVADO").pode).toBe(true);
    expect(podeReabrir("RASCUNHO").pode).toBe(false);
  });
});

describe("planoDeAprovacao — só uma aprovada por empresa e ano", () => {
  it("aprovar um rascunho devolve a aprovada anterior a rascunho", () => {
    const versoes = [v("original", "APROVADO", "2026-01-10"), v("revisao", "RASCUNHO", null)];
    expect(planoDeAprovacao(versoes, "revisao")).toEqual({ ok: true, rebaixar: ["original"] });
  });

  it("sem aprovada anterior, não rebaixa ninguém", () => {
    expect(planoDeAprovacao([v("a", "RASCUNHO", null), v("b", "RASCUNHO", null)], "a")).toEqual({ ok: true, rebaixar: [] });
  });

  it("dado inconsistente com duas aprovadas: aprovar outra rebaixa as duas", () => {
    const versoes = [v("a", "APROVADO", "2026-01-01"), v("b", "APROVADO", "2026-02-01"), v("c", "RASCUNHO", null)];
    const plano = planoDeAprovacao(versoes, "c");
    expect(plano.ok && plano.rebaixar.sort()).toEqual(["a", "b"]);
  });

  it("recusa aprovar o que já está aprovado ou não existe", () => {
    expect(planoDeAprovacao([v("a", "APROVADO", "2026-01-01")], "a").ok).toBe(false);
    expect(planoDeAprovacao([v("a", "RASCUNHO", null)], "x").ok).toBe(false);
  });

  it("depois do plano aplicado, sobra exatamente uma aprovada", () => {
    const versoes = [v("a", "APROVADO", "2026-01-01"), v("b", "RASCUNHO", null), v("c", "RASCUNHO", null)];
    const plano = planoDeAprovacao(versoes, "b");
    if (!plano.ok) throw new Error(plano.motivo);
    const depois = versoes.map((x) =>
      x.id === "b" ? { ...x, status: "APROVADO" as const } : plano.rebaixar.includes(x.id) ? { ...x, status: "RASCUNHO" as const } : x
    );
    expect(depois.filter((x) => x.status === "APROVADO").map((x) => x.id)).toEqual(["b"]);
  });
});

describe("versaoAprovada e versaoPadrao", () => {
  it("a aprovada; com duas por inconsistência, a aprovada por último", () => {
    expect(versaoAprovada([v("a", "RASCUNHO", null)])).toBeNull();
    expect(versaoAprovada([v("a", "APROVADO", "2026-01-01"), v("b", "APROVADO", "2026-03-01")])?.id).toBe("b");
  });

  it("a tela abre na aprovada, senão na mexida por último", () => {
    expect(versaoPadrao([v("a", "RASCUNHO", null, "2026-05-01"), v("b", "APROVADO", "2026-02-01", "2026-02-01")])?.id).toBe("b");
    expect(versaoPadrao([v("a", "RASCUNHO", null, "2026-05-01"), v("b", "RASCUNHO", null, "2026-06-01")])?.id).toBe("b");
    expect(versaoPadrao([])).toBeNull();
  });
});

describe("nome e ano", () => {
  it("valida o nome da versão", () => {
    expect(validarNomeDaVersao("  Revisão   de junho ")).toEqual({ ok: true, nome: "Revisão de junho" });
    expect(validarNomeDaVersao("").ok).toBe(false);
    expect(validarNomeDaVersao("x".repeat(81)).ok).toBe(false);
  });

  it("lê o ano entre 2000 e 2100", () => {
    expect(lerAno("2026")).toBe(2026);
    expect(lerAno("1999")).toBeNull();
    expect(lerAno("26")).toBeNull();
    expect(lerAno(undefined)).toBeNull();
  });
});
