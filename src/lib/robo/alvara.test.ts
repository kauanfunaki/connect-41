import { describe, expect, it } from "vitest";
import { ACEITE_ANTES_DE_IMPRIMIR } from "@/lib/societario/orgaos/alvara-curitiba";
import { aceiteConfere, cidadeAceita, decidirAlvara, ehAlvara, nomeDoPdfDoAlvara, numeroDoAlvara, pedidoDoAlvara, resultadoDoAlvaraSchema } from "./alvara";

// O alvará de Curitiba pelo robô (30/10/2026). O texto da página abaixo segue
// os campos levantados em 11/09 (alvará 1.700.407 da 41 Contabilidade).
const PAGINA = `Alvará de Licença para Localização
Nº 1.700.407
Inscrição Municipal 17 19 804.925-8
Observações: Alvará emitido pelo Protocolo PRP2151987803, em 11/08/2023.
${ACEITE_ANTES_DE_IMPRIMIR}`;

const encontrado = (extra: Partial<Parameters<typeof decidirAlvara>[0]> = {}) =>
  resultadoDoAlvaraSchema.parse({ tela: "encontrado", texto: PAGINA, aceite: ACEITE_ANTES_DE_IMPRIMIR, aceiteMarcado: true, ...extra });

describe("pedidoDoAlvara", () => {
  const base = { tipoDaLicenca: "Alvará de Funcionamento", revogada: false, inscricao: "12.345.678", cidade: "Curitiba" };

  it("normaliza a inscrição para os oito números", () => {
    expect(pedidoDoAlvara(base)).toEqual({ ok: true, dados: { inscricao: "12345678" } });
  });

  it("recusa o que não é alvará, revogado, de outra cidade ou sem inscrição", () => {
    expect(pedidoDoAlvara({ ...base, tipoDaLicenca: "Licença Sanitária" }).ok).toBe(false);
    expect(pedidoDoAlvara({ ...base, revogada: true }).ok).toBe(false);
    expect(pedidoDoAlvara({ ...base, cidade: "São José dos Pinhais" }).ok).toBe(false);
    expect(pedidoDoAlvara({ ...base, inscricao: null }).ok).toBe(false);
    expect(pedidoDoAlvara({ ...base, inscricao: "123" }).ok).toBe(false);
  });

  it("cidade em branco passa: o cadastro de muita empresa ainda não tem", () => {
    expect(cidadeAceita(null)).toBe(true);
    expect(cidadeAceita("CURITIBA")).toBe(true);
  });

  it("reconhece o alvará como o setor escreve", () => {
    expect(ehAlvara("ALVARÁ")).toBe(true);
    expect(ehAlvara("Alvara de localização")).toBe(true);
    expect(ehAlvara("Bombeiros")).toBe(false);
  });
});

describe("decidirAlvara", () => {
  it("achou, aceite igual e marcado, PDF veio: guarda, com número, protocolo e data", () => {
    const d = decidirAlvara(encontrado(), true);
    expect(d).toEqual({ tipo: "guardar", numero: "1.700.407", protocolo: "PRP2151987803", emitidoEm: new Date(Date.UTC(2023, 7, 11, 12)) });
  });

  it("sem PDF, chama alguém", () => {
    expect(decidirAlvara(encontrado(), false).tipo).toBe("pessoa");
    expect(decidirAlvara(encontrado({ aceiteMarcado: false }), true).tipo).toBe("pessoa");
  });

  it("aceite com texto novo não é assumido pelo robô", () => {
    const d = decidirAlvara(encontrado({ aceite: "Declaro que cumpro a nova lei de acessibilidade." }), true);
    expect(d.tipo).toBe("pessoa");
  });

  it("não encontrado e tela desconhecida vão para alguém", () => {
    expect(decidirAlvara(resultadoDoAlvaraSchema.parse({ tela: "nao_encontrado" }), false).tipo).toBe("pessoa");
    expect(decidirAlvara(resultadoDoAlvaraSchema.parse({ tela: "outra" }), false).tipo).toBe("pessoa");
  });

  it("observação fora do formato não inventa data", () => {
    const d = decidirAlvara(encontrado({ texto: "Alvará Nº 1.855.561" }), true);
    expect(d).toEqual({ tipo: "guardar", numero: "1.855.561", protocolo: null, emitidoEm: null });
  });
});

describe("detalhes", () => {
  it("o aceite confere mesmo com quebra de linha diferente", () => {
    expect(aceiteConfere(ACEITE_ANTES_DE_IMPRIMIR.replace(/ /g, "\n "))).toBe(true);
    expect(aceiteConfere(null)).toBe(false);
  });

  it("sem número no texto, nulo", () => {
    expect(numeroDoAlvara("Consulta de alvará")).toBeNull();
  });

  it("o nome do PDF segue a convenção do setor", () => {
    expect(nomeDoPdfDoAlvara("Padaria do Zé", 2023)).toBe("PADARIA DO ZÉ - Alvará de Funcionamento 2023.pdf");
  });
});
