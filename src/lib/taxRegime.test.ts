import { describe, expect, it } from "vitest";
import { resumirRegime } from "./taxRegime";

describe("resumirRegime", () => {
  it("corta o detalhe de cadastro do Simples", () => {
    expect(resumirRegime("Simples Nacional - Comércio ou Serviço - Com Pró-labore - Com Funcionários")).toBe(
      "Simples Nacional"
    );
    expect(resumirRegime("Simples Nacional - Comércio ou Serviço - Sem Pró-labore - Sem Funcionários")).toBe(
      "Simples Nacional"
    );
  });

  it("mantém 'sem movimento', que muda o trabalho do escritório", () => {
    expect(resumirRegime("Lucro Presumido - Sem Movimento")).toBe("Lucro Presumido · sem movimento");
    expect(resumirRegime("Lucro Real - Sem Movimento")).toBe("Lucro Real · sem movimento");
    expect(resumirRegime("Simples Nacional - Serviço ou Comércio - Sem Movimento")).toBe(
      "Simples Nacional · sem movimento"
    );
  });

  it("não repete o sufixo quando ele já está na base", () => {
    expect(resumirRegime("Lucro Real Inativa - Sem Funcionários e Com Pro-Labóre")).toBe("Lucro Real Inativa");
  });

  it("distingue com movimento de sem movimento — era o risco de encurtar", () => {
    const comum = resumirRegime("Lucro Presumido - Comércio Indústria e Serviço");
    const parado = resumirRegime("Lucro Presumido - Sem Movimento");
    expect(comum).toBe("Lucro Presumido");
    expect(comum).not.toBe(parado);
  });

  it("regime sem hífen passa inteiro", () => {
    expect(resumirRegime("Produtor Rural")).toBe("Produtor Rural");
    expect(resumirRegime("Imune/Isenta")).toBe("Imune/Isenta");
    expect(resumirRegime("Indefinido")).toBe("Indefinido");
  });

  it("MEI perde só a contagem de funcionário", () => {
    expect(resumirRegime("MEI - Com Funcionário")).toBe("MEI");
    expect(resumirRegime("MEI - Sem Funcionário")).toBe("MEI");
  });

  it("vazio vira null, para a tabela mostrar o travessão", () => {
    expect(resumirRegime(null)).toBeNull();
    expect(resumirRegime(undefined)).toBeNull();
    expect(resumirRegime("   ")).toBeNull();
  });
});
