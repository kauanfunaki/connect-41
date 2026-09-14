import { describe, it, expect } from "vitest";
import {
  ehTaxaDoBombeiros,
  arquivarTaxaDeBombeiros,
  contatosDaEmpresa,
  destinatarios,
  podeEnviar,
  validarGuia,
  TAMANHO_MAXIMO_DA_GUIA,
} from "./arquivamento";

const HOJE = new Date("2026-09-14T15:00:00Z");

describe("ehTaxaDoBombeiros", () => {
  it("reconhece pela sigla do seed", () => {
    expect(ehTaxaDoBombeiros({ sigla: "CB", nome: null })).toBe(true);
    expect(ehTaxaDoBombeiros({ sigla: " cb ", nome: null })).toBe(true);
  });

  it("reconhece pelo nome quando a sigla não bate", () => {
    expect(ehTaxaDoBombeiros({ sigla: null, nome: "Corpo de Bombeiros" })).toBe(true);
  });

  // A convenção de pasta só existe para o Bombeiros: taxa da Receita arquivada
  // em "Prefeitura" seria o defeito.
  it("recusa outro órgão e taxa sem órgão", () => {
    expect(ehTaxaDoBombeiros({ sigla: "RFB", nome: "Receita Federal" })).toBe(false);
    expect(ehTaxaDoBombeiros(null)).toBe(false);
  });
});

describe("arquivarTaxaDeBombeiros", () => {
  it("segue a convenção do setor, com o ano do vencimento", () => {
    const a = arquivarTaxaDeBombeiros("Irriga Four Ltda", new Date("2027-02-10T12:00:00Z"), HOJE);
    expect(a.nome).toBe("IRRIGA FOUR LTDA - Taxa Bombeiros 2027");
    expect(a.caminho).toBe("Societário › Prefeitura › Bombeiros › 2027 › IRRIGA FOUR LTDA - Taxa Bombeiros 2027");
  });
});

describe("contatosDaEmpresa + destinatarios", () => {
  it("junta o e-mail da empresa e o das pessoas, e nomeia quem ficou de fora", () => {
    const d = destinatarios(
      contatosDaEmpresa({ email: null }, [
        { name: "Ana", email: "ana@acme.com" },
        { name: "Bruno", email: null },
      ])
    );
    expect(d.para).toEqual(["ana@acme.com"]);
    expect(d.descartados.map((x) => x.rotulo)).toEqual(["E-mail da empresa", "Bruno"]);
    expect(podeEnviar(d, true).pode).toBe(true);
  });

  it("empresa e pessoa com o mesmo e-mail recebem uma vez só", () => {
    const d = destinatarios(contatosDaEmpresa({ email: "financeiro@acme.com" }, [{ name: "Ana", email: "Financeiro@acme.com" }]));
    expect(d.para).toEqual(["financeiro@acme.com"]);
  });
});

describe("validarGuia", () => {
  it("aceita PDF dentro do teto", () => {
    expect(validarGuia({ type: "application/pdf", size: 200 * 1024 })).toEqual({ ok: true });
  });

  it("recusa o que não é PDF", () => {
    expect(validarGuia({ type: "image/png", size: 1000 }).ok).toBe(false);
  });

  // Acima do corpo máximo da Server Action o erro chegaria sem dizer a causa.
  it("recusa acima do teto e arquivo vazio", () => {
    expect(validarGuia({ type: "application/pdf", size: TAMANHO_MAXIMO_DA_GUIA + 1 }).ok).toBe(false);
    expect(validarGuia({ type: "application/pdf", size: 0 }).ok).toBe(false);
  });
});
