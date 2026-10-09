import { describe, expect, it } from "vitest";
import {
  chaveDaAutorizacao,
  faixaDeAviso,
  FAIXAS_DA_VALIDACAO,
  FAIXAS_DO_VENCIMENTO,
  formatarChave,
  lerCodigosDeServico,
  lerListaDeDocumentos,
  noRecorte,
  prazoParaValidar,
  situacaoDaAutorizacao,
  textoDoAvisoDeValidacao,
  textoDoPedido,
  validarAutorizacao,
  validarQuemRecebe,
  type RegistroDaAutorizacao,
} from "./regras";

const HOJE = "2026-10-09";
const registro = (r: Partial<RegistroDaAutorizacao>): RegistroDaAutorizacao => ({
  status: "ACTIVE",
  requestedAt: null,
  receivedAt: null,
  validatedAt: null,
  expiresAt: null,
  ...r,
});

describe("a chave da autorização", () => {
  it("matriz e filial têm a mesma chave: a raiz do CNPJ", () => {
    const matriz = chaveDaAutorizacao({ kind: "PESSOA_JURIDICA", cnpj: "11.222.333/0001-81", cpf: null });
    const filial = chaveDaAutorizacao({ kind: "PESSOA_JURIDICA", cnpj: "11222333000262", cpf: null });
    expect(matriz).toBe("11222333");
    expect(filial).toBe(matriz);
  });

  it("pessoa física usa o CPF inteiro; sem documento válido não tem chave", () => {
    expect(chaveDaAutorizacao({ kind: "PESSOA_FISICA", cnpj: null, cpf: "529.982.247-25" })).toBe("52998224725");
    expect(chaveDaAutorizacao({ kind: "PESSOA_JURIDICA", cnpj: "11.222.333/0001-82", cpf: null })).toBeNull();
    expect(chaveDaAutorizacao({ kind: "PESSOA_JURIDICA", cnpj: null, cpf: null })).toBeNull();
  });

  it("formata a raiz e o CPF", () => {
    expect(formatarChave("11222333")).toBe("11.222.333");
    expect(formatarChave("52998224725")).toBe("529.982.247-25");
  });
});

describe("a lista colada", () => {
  it("acha CNPJ e CPF com e sem pontuação, junta filial com matriz e aponta os inválidos", () => {
    const texto = [
      "11.222.333/0001-81 — Empresa A",
      "11222333000262",
      "98765432000198;529.982.247-25",
      "CNPJ 11.222.333/0001-82 (dígito errado)",
      "telefone 41 99999-0000, protocolo 2026",
    ].join("\n");
    const { chaves, invalidos } = lerListaDeDocumentos(texto);
    expect(chaves).toEqual(["11222333", "98765432", "52998224725"]);
    expect(invalidos).toEqual(["11.222.333/0001-82"]);
  });

  it("não pega um pedaço de número maior", () => {
    expect(lerListaDeDocumentos("1122233300018199").chaves).toEqual([]);
  });
});

describe("a situação", () => {
  it("sem registro, falta pedir", () => {
    expect(situacaoDaAutorizacao(null, HOJE)).toBe("falta_pedir");
  });

  it("cadastrada pelo cliente: validar até 30 dias depois; no 31º, caiu", () => {
    expect(prazoParaValidar("2026-09-09")).toBe("2026-10-09");
    expect(situacaoDaAutorizacao(registro({ status: "PENDING_VALIDATION", receivedAt: "2026-09-09" }), HOJE)).toBe("validar");
    expect(situacaoDaAutorizacao(registro({ status: "PENDING_VALIDATION", receivedAt: "2026-09-08" }), HOJE)).toBe("caiu");
  });

  it("validada: ativa, a renovar com 60 dias ou menos, vencida depois do fim", () => {
    expect(situacaoDaAutorizacao(registro({ expiresAt: null }), HOJE)).toBe("ativa");
    expect(situacaoDaAutorizacao(registro({ expiresAt: "2027-10-09" }), HOJE)).toBe("ativa");
    expect(situacaoDaAutorizacao(registro({ expiresAt: "2026-12-08" }), HOJE)).toBe("a_renovar");
    expect(situacaoDaAutorizacao(registro({ expiresAt: HOJE }), HOJE)).toBe("a_renovar");
    expect(situacaoDaAutorizacao(registro({ expiresAt: "2026-10-08" }), HOJE)).toBe("vencida");
  });

  it("o recorte “Falta pedir” junta as nunca pedidas com as perdidas", () => {
    for (const s of ["falta_pedir", "caiu", "cancelada", "vencida"] as const) expect(noRecorte(s, "pedir"), s).toBe(true);
    for (const s of ["pedida", "validar", "ativa", "a_renovar", "nao_se_aplica"] as const) expect(noRecorte(s, "pedir"), s).toBe(false);
  });

  it("“Pendentes” deixa de fora só as ativas longe de vencer e as que não se aplicam", () => {
    expect(noRecorte("ativa", "pendentes")).toBe(false);
    expect(noRecorte("nao_se_aplica", "pendentes")).toBe(false);
    expect(noRecorte("a_renovar", "pendentes")).toBe(true);
    expect(noRecorte("a_renovar", "ativa")).toBe(true);
  });
});

describe("os avisos", () => {
  it("a faixa é a menor que cobre os dias que faltam; depois do prazo, passou", () => {
    expect(faixaDeAviso(15, FAIXAS_DA_VALIDACAO)).toBeNull();
    expect(faixaDeAviso(10, FAIXAS_DA_VALIDACAO)).toBe(10);
    expect(faixaDeAviso(5, FAIXAS_DA_VALIDACAO)).toBe(10);
    expect(faixaDeAviso(3, FAIXAS_DA_VALIDACAO)).toBe(3);
    expect(faixaDeAviso(0, FAIXAS_DA_VALIDACAO)).toBe(0);
    expect(faixaDeAviso(-1, FAIXAS_DA_VALIDACAO)).toBe("passou");
    expect(faixaDeAviso(45, FAIXAS_DO_VENCIMENTO)).toBe(60);
  });

  it("o texto do aviso de validação diz até quando", () => {
    expect(textoDoAvisoDeValidacao("Padaria Sol", "2026-10-12", HOJE)).toBe(
      "Autorização de acesso de Padaria Sol precisa ser validada no Portal da Receita até 12/10/2026 (3 dias)."
    );
    expect(textoDoAvisoDeValidacao("Padaria Sol", "2026-10-08", HOJE)).toContain("caiu em 08/10/2026");
  });
});

describe("o que o setor grava", () => {
  it("pedida: o dia do pedido é hoje quando não vem", () => {
    const r = validarAutorizacao({ status: "REQUESTED" }, HOJE);
    expect(r).toMatchObject({ ok: true, dados: { status: "REQUESTED", requestedAt: HOJE } });
  });

  it("validada: guarda o dia do pedido e do cadastro que já existiam", () => {
    const r = validarAutorizacao({ status: "ACTIVE", expiresAt: "2031-10-01" }, HOJE, { requestedAt: "2026-09-01", receivedAt: "2026-09-20" });
    expect(r).toMatchObject({
      ok: true,
      dados: { requestedAt: "2026-09-01", receivedAt: "2026-09-20", validatedAt: HOJE, expiresAt: "2031-10-01", allServices: true, services: null },
    });
  });

  it("recusa validade passada, além de 5 anos, data futura e cadastro de mais de 30 dias", () => {
    expect(validarAutorizacao({ status: "ACTIVE", expiresAt: "2026-10-01" }, HOJE)).toMatchObject({ ok: false });
    expect(validarAutorizacao({ status: "ACTIVE", expiresAt: "2032-01-01" }, HOJE)).toMatchObject({ ok: false });
    expect(validarAutorizacao({ status: "REQUESTED", requestedAt: "2026-10-10" }, HOJE)).toMatchObject({ ok: false });
    expect(validarAutorizacao({ status: "PENDING_VALIDATION", receivedAt: "2026-09-01" }, HOJE)).toMatchObject({ ok: false });
    expect(validarAutorizacao({ status: "ACTIVE", expiresAt: "31/12/2030" }, HOJE)).toMatchObject({ ok: false });
    expect(validarAutorizacao({ status: "QUALQUER" }, HOJE)).toMatchObject({ ok: false });
  });

  it("só alguns serviços: exige os códigos e guarda só eles", () => {
    expect(validarAutorizacao({ status: "ACTIVE", allServices: false, services: "" }, HOJE)).toMatchObject({ ok: false });
    const r = validarAutorizacao({ status: "ACTIVE", allServices: false, services: "00146 PGDAS-D; 00103 DCTFWeb, 00146" }, HOJE);
    expect(r).toMatchObject({ ok: true, dados: { allServices: false, services: "00146, 00103" } });
    expect(lerCodigosDeServico("sem código")).toBeNull();
  });
});

describe("o pedido ao cliente", () => {
  it("leva o CNPJ de quem recebe e os serviços “Todos”", () => {
    const texto = textoDoPedido({ nome: "Escritório Modelo", cnpj: "11.222.333/0001-81" }, "Padaria Sol");
    expect(texto).toContain("informe o CNPJ 11.222.333/0001-81 (Escritório Modelo)");
    expect(texto).toContain("“Todos”");
    expect(texto).toContain("Padaria Sol");
  });

  it("quem recebe é um CNPJ válido, com nome", () => {
    expect(validarQuemRecebe("  Escritório   Modelo ", "11.222.333/0001-81")).toEqual({ ok: true, nome: "Escritório Modelo", cnpj: "11222333000181" });
    expect(validarQuemRecebe("Escritório Modelo", "11.222.333/0001-82")).toMatchObject({ ok: false });
    expect(validarQuemRecebe("Escritório Modelo", "529.982.247-25")).toMatchObject({ ok: false });
    expect(validarQuemRecebe(" ", "11.222.333/0001-81")).toMatchObject({ ok: false });
  });
});
