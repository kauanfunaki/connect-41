import { describe, expect, it } from "vitest";
import { lerRespostaDaLicenca, nomeDoPdfDaLicenca } from "./leituraDaLicenca";

// A leitura do alvará e da licença pela IA (04/11/2026): o que o código confere
// no que voltou, com respostas fictícias. CNPJs válidos de exemplo.

const HOJE = "2026-11-04";
const EMPRESA = "11444777000161";

const resposta = (o: Record<string, unknown> = {}) => ({
  tipoDoDocumento: "licenca",
  nomeDoDocumento: "Alvará de Licença de Localização",
  orgao: "Prefeitura Municipal de Curitiba",
  titular: "Empresa Fictícia Ltda",
  documentoDoTitular: EMPRESA,
  numero: "1.700.407",
  emissao: "2026-03-10",
  validade: "2027-03-10",
  validadeIndeterminada: false,
  ...o,
});

describe("lerRespostaDaLicenca", () => {
  it("a licença lida inteira preenche tudo, sem nada a conferir", () => {
    expect(lerRespostaDaLicenca(resposta(), HOJE, EMPRESA)).toEqual({
      ehLicenca: true,
      tipo: "Alvará de Licença de Localização",
      numero: "1.700.407",
      emissaoKey: "2026-03-10",
      validadeKey: "2027-03-10",
      semValidade: false,
      orgao: "Prefeitura Municipal de Curitiba",
      conferir: [],
      avisos: [],
    });
  });

  it("titular de outra empresa avisa; a filial do mesmo grupo não", () => {
    expect(lerRespostaDaLicenca(resposta({ documentoDoTitular: "11222333000181" }), HOJE, EMPRESA).avisos[0]).toMatch(/não a empresa desta licença/);
    expect(lerRespostaDaLicenca(resposta({ documentoDoTitular: "11444777000242" }), HOJE, EMPRESA).avisos).toEqual([]);
  });

  it("validade indeterminada fica em branco, sem pedir conferência", () => {
    const l = lerRespostaDaLicenca(resposta({ validade: "", validadeIndeterminada: true }), HOJE, EMPRESA);
    expect(l).toMatchObject({ semValidade: true, validadeKey: null, conferir: [] });
  });

  it("emissão no futuro e validade antes da emissão são leituras erradas: ficam em branco, com aviso", () => {
    const futura = lerRespostaDaLicenca(resposta({ emissao: "2026-12-01" }), HOJE, EMPRESA);
    expect(futura.emissaoKey).toBeNull();
    expect(futura.conferir).toContain("emissao");
    const invertida = lerRespostaDaLicenca(resposta({ validade: "2026-01-01" }), HOJE, EMPRESA);
    expect(invertida.validadeKey).toBeNull();
    expect(invertida.avisos.join(" ")).toMatch(/antes da emissão/);
  });

  it("licença vencida avisa; o que não é licença pede conferência de tudo", () => {
    expect(lerRespostaDaLicenca(resposta({ emissao: "2024-01-10", validade: "2025-01-10" }), HOJE, EMPRESA).avisos.join(" ")).toMatch(/venceu em 10\/01\/2025/);
    const outro = lerRespostaDaLicenca({ tipoDoDocumento: "outro" }, HOJE, EMPRESA);
    expect(outro.ehLicenca).toBe(false);
    expect(outro.conferir).toEqual(["numero", "emissao", "validade"]);
  });

  it("data inválida e resposta vazia não quebram", () => {
    expect(lerRespostaDaLicenca(resposta({ emissao: "2026-02-31" }), HOJE, EMPRESA).emissaoKey).toBeNull();
    expect(lerRespostaDaLicenca(null, HOJE, null).ehLicenca).toBe(false);
  });

  it("o nome do PDF segue a convenção do setor", () => {
    expect(nomeDoPdfDaLicenca("Padaria do Zé", "Licença Sanitária", 2026)).toBe("PADARIA DO ZÉ - Licença Sanitária 2026.pdf");
  });
});
