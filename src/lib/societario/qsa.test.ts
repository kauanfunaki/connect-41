import { describe, expect, it } from "vitest";
import { lerQsa, mesmoSocio, planejarImportacao, type SocioCadastrado } from "./qsa";

// Formato da resposta real da BrasilAPI (25/09), com nomes trocados.
const corpo = {
  qsa: [
    {
      nome_socio: "MARIA  DA SILVA",
      cnpj_cpf_do_socio: "***504269**",
      qualificacao_socio: "Sócio-Administrador",
      codigo_qualificacao_socio: 49,
      data_entrada_sociedade: "2026-01-21",
      identificador_de_socio: 2,
    },
    {
      nome_socio: "HOLDING EXEMPLO LTDA",
      cnpj_cpf_do_socio: "12345678000190",
      qualificacao_socio: "Sócio",
      codigo_qualificacao_socio: 22,
      data_entrada_sociedade: "",
      identificador_de_socio: 1,
    },
  ],
};

describe("lerQsa", () => {
  it("pessoa física com CPF mascarado; jurídica com CNPJ inteiro", () => {
    const [pf, pj] = lerQsa(corpo);
    expect(pf).toEqual({
      nome: "MARIA DA SILVA",
      documento: null,
      documentoMascarado: "***504269**",
      qualificacao: "Sócio-Administrador",
      administrador: true,
      entrada: new Date("2026-01-21T12:00:00Z"),
    });
    expect(pj).toMatchObject({ documento: "12345678000190", documentoMascarado: null, administrador: false, entrada: null });
  });

  it("sem qsa, lista vazia", () => {
    expect(lerQsa({ razao_social: "X" })).toEqual([]);
  });
});

describe("mesmoSocio", () => {
  const [pf, pj] = lerQsa(corpo);
  const cad = (x: Partial<SocioCadastrado>): SocioCadastrado => ({
    id: "1",
    name: "Maria da Silva",
    document: null,
    documentMasked: null,
    exitDate: null,
    ...x,
  });

  it("CPF inteiro no cadastro casa pelos seis do meio e pelo nome, sem acento nem caixa", () => {
    expect(mesmoSocio(cad({ document: "12350426912" }), pf)).toBe(true);
    expect(mesmoSocio(cad({ document: "12399999912" }), pf)).toBe(false);
  });

  it("cadastro manual sem documento casa pelo nome", () => {
    expect(mesmoSocio(cad({}), pf)).toBe(true);
    expect(mesmoSocio(cad({ name: "Maria Souza" }), pf)).toBe(false);
  });

  it("sócio PJ casa só pelo CNPJ", () => {
    expect(mesmoSocio(cad({ name: "Outro nome", document: "12345678000190" }), pj)).toBe(true);
    expect(mesmoSocio(cad({ name: "HOLDING EXEMPLO LTDA" }), pj)).toBe(false);
  });
});

describe("planejarImportacao", () => {
  it("separa novos, já cadastrados e quem está no Connect mas não na Receita", () => {
    const daReceita = lerQsa(corpo);
    const plano = planejarImportacao(
      [
        { id: "a", name: "Maria da Silva", document: null, documentMasked: null, exitDate: null },
        { id: "b", name: "João Antigo", document: null, documentMasked: null, exitDate: null },
        { id: "c", name: "José Que Saiu", document: null, documentMasked: null, exitDate: new Date() },
      ],
      daReceita
    );
    expect(plano.jaCadastrados.map((j) => j.id)).toEqual(["a"]);
    expect(plano.novos.map((n) => n.nome)).toEqual(["HOLDING EXEMPLO LTDA"]);
    // Quem já tem saída registrada não é sugerido de novo.
    expect(plano.foraDaReceita.map((f) => f.id)).toEqual(["b"]);
  });
});
