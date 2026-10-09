import { describe, expect, it } from "vitest";
import { camposDoRegime, OPCOES_DE_REGIME, resumirRegime, type CamposDoRegime } from "./taxRegime";

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

describe("camposDoRegime", () => {
  type Esperado = Omit<CamposDoRegime, "taxRegime">;
  const campos = (
    taxRegimeKind: Esperado["taxRegimeKind"],
    taxNoMovement: boolean,
    taxHasEmployees: boolean | null,
    taxHasProLabore: boolean | null
  ): Esperado => ({ taxRegimeKind, taxNoMovement, taxHasEmployees, taxHasProLabore });

  // As 16 opções do formulário (OPCOES_DE_REGIME), que são os rótulos do
  // Acessórias. Cada uma tem de sair com os quatro campos certos.
  const ROTULOS: [string, Esperado][] = [
    ["Indefinido", campos(null, false, null, null)],
    ["Domésticas - CEI", campos("DOMESTICA", false, null, null)],
    ["Imune/Isenta", campos("IMUNE_ISENTA", false, null, null)],
    ["Lucro Presumido - Comércio Indústria e Serviço", campos("LUCRO_PRESUMIDO", false, null, null)],
    ["Lucro Presumido - Sem Movimento", campos("LUCRO_PRESUMIDO", true, null, null)],
    ["Lucro Real - Comércio Indústria e Serviço", campos("LUCRO_REAL", false, null, null)],
    ["Lucro Real - Sem Movimento", campos("LUCRO_REAL", true, null, null)],
    ["Lucro Real Inativa - Sem Funcionários e Com Pro-Labóre", campos("LUCRO_REAL", true, false, true)],
    ["MEI - Com Funcionário", campos("MEI", false, true, null)],
    ["MEI - Sem Funcionário", campos("MEI", false, false, null)],
    ["Produtor Rural", campos("PRODUTOR_RURAL", false, null, null)],
    ["Simples Nacional - Comércio ou Serviço - Com Pró-labore - Com Funcionários", campos("SIMPLES_NACIONAL", false, true, true)],
    ["Simples Nacional - Comércio ou Serviço - Com Pró-labore - Sem Funcionários", campos("SIMPLES_NACIONAL", false, false, true)],
    ["Simples Nacional - Comércio ou Serviço - Sem Pró-labore - Com Funcionários", campos("SIMPLES_NACIONAL", false, true, false)],
    ["Simples Nacional - Comércio ou Serviço - Sem Pró-labore - Sem Funcionários", campos("SIMPLES_NACIONAL", false, false, false)],
    ["Simples Nacional - Serviço ou Comércio - Sem Movimento", campos("SIMPLES_NACIONAL", true, null, null)],
  ];

  it.each(ROTULOS)("bate com o rótulo do Acessórias: %s", (rotulo, esperado) => {
    expect(camposDoRegime(rotulo)).toEqual({ taxRegime: rotulo, ...esperado });
  });

  it("cobre todas as opções do formulário, e só elas", () => {
    // Opção nova no formulário sem linha aqui é regime gravado sem ninguém
    // conferir os campos que saem dele.
    expect(ROTULOS.map(([r]) => r).sort()).toEqual([...OPCOES_DE_REGIME].sort());
  });

  it("reconhece os valores antigos que a produção ainda tem", () => {
    expect(camposDoRegime("SIMPLES_NACIONAL").taxRegimeKind).toBe("SIMPLES_NACIONAL");
    expect(camposDoRegime("Simples Nacional").taxRegimeKind).toBe("SIMPLES_NACIONAL");
    expect(camposDoRegime("Simples Nacional")).toMatchObject({ taxHasEmployees: null, taxHasProLabore: null });
  });

  it("não depende de maiúscula nem de acento", () => {
    expect(camposDoRegime("simples nacional - comercio ou servico - com pro-labore - sem funcionarios")).toMatchObject(
      campos("SIMPLES_NACIONAL", false, false, true)
    );
  });

  it("'comércio' não é 'com pró-labore'", () => {
    // O rótulo começa a parte do meio com "Comércio"; o pró-labore é decidido
    // pelo trecho "Sem Pró-labore", não pelo "Com" de "Comércio".
    expect(camposDoRegime("Simples Nacional - Comércio ou Serviço - Sem Pró-labore - Sem Funcionários").taxHasProLabore).toBe(
      false
    );
  });

  it("vazio limpa os quatro campos e grava o texto como null", () => {
    const limpo = { taxRegime: null, taxRegimeKind: null, taxNoMovement: false, taxHasEmployees: null, taxHasProLabore: null };
    expect(camposDoRegime(null)).toEqual(limpo);
    expect(camposDoRegime(undefined)).toEqual(limpo);
    expect(camposDoRegime("   ")).toEqual(limpo);
  });

  it("texto que não se reconhece guarda o texto e deixa o regime em branco", () => {
    expect(camposDoRegime("Cooperativa")).toEqual({
      taxRegime: "Cooperativa",
      taxRegimeKind: null,
      taxNoMovement: false,
      taxHasEmployees: null,
      taxHasProLabore: null,
    });
  });

  it("apara o texto gravado", () => {
    expect(camposDoRegime("  Lucro Presumido - Sem Movimento ").taxRegime).toBe("Lucro Presumido - Sem Movimento");
  });
});
