import { describe, expect, it } from "vitest";
import { MARCA_DO_PEDIDO_PUBLICO, descricaoDoPedido, validarPedido } from "./pedidoPublico";
import { LIMITES_DO_PEDIDO } from "./linkPublico";

// O formulário do pedido pelo link público (09/11/2026): o servidor confere
// tudo de novo, com limites de tamanho, e devolve o primeiro campo com
// problema na ordem da tela.

const VALIDO = {
  nome: "  Maria   da Silva ",
  email: " Maria@Exemplo.com.br ",
  telefone: "(41) 99999-0000",
  empresa: "Padaria Exemplo",
  documento: "",
  mensagem: "Quero abrir uma padaria em Curitiba, com dois sócios.",
  aceite: "1",
};

describe("validarPedido", () => {
  it("limpa os campos: espaços, e-mail em minúsculas, telefone em dígitos", () => {
    const r = validarPedido(VALIDO);
    expect(r).toEqual({
      ok: true,
      pedido: {
        nome: "Maria da Silva",
        email: "maria@exemplo.com.br",
        telefone: "41999990000",
        empresa: "Padaria Exemplo",
        documento: null,
        mensagem: "Quero abrir uma padaria em Curitiba, com dois sócios.",
      },
    });
  });

  it("CPF ou CNPJ é opcional; quando vem, tem de ser válido e diz qual é", () => {
    const cpf = validarPedido({ ...VALIDO, documento: "529.982.247-25" });
    expect(cpf.ok && cpf.pedido.documento).toEqual({ tipo: "CPF", digitos: "52998224725" });
    const cnpj = validarPedido({ ...VALIDO, documento: "11.222.333/0001-81" });
    expect(cnpj.ok && cnpj.pedido.documento).toEqual({ tipo: "CNPJ", digitos: "11222333000181" });
    expect(validarPedido({ ...VALIDO, documento: "111.111.111-11" })).toMatchObject({ ok: false, campo: "documento" });
    expect(validarPedido({ ...VALIDO, documento: "123" })).toMatchObject({ ok: false, campo: "documento" });
  });

  it("o erro aponta o primeiro campo com problema, na ordem da tela", () => {
    expect(validarPedido({ ...VALIDO, nome: "", telefone: "123" })).toMatchObject({ ok: false, campo: "nome" });
    expect(validarPedido({ ...VALIDO, telefone: "123", mensagem: "" })).toMatchObject({ ok: false, campo: "telefone" });
    expect(validarPedido({ ...VALIDO, email: "maria@" })).toEqual({
      ok: false,
      campo: "email",
      erro: "Informe um e-mail válido, como nome@exemplo.com.br.",
    });
  });

  it("sem o aceite de uso dos dados, não envia", () => {
    expect(validarPedido({ ...VALIDO, aceite: null })).toMatchObject({ ok: false, campo: "aceite" });
    expect(validarPedido({ ...VALIDO, aceite: "on" }).ok).toBe(true);
  });

  it("limites de tamanho valem no servidor, não só no maxLength da tela", () => {
    expect(validarPedido({ ...VALIDO, nome: "a".repeat(LIMITES_DO_PEDIDO.nome + 1) })).toMatchObject({ ok: false, campo: "nome" });
    expect(validarPedido({ ...VALIDO, empresa: "a".repeat(LIMITES_DO_PEDIDO.empresa + 1) })).toMatchObject({ ok: false, campo: "empresa" });
    expect(validarPedido({ ...VALIDO, mensagem: "a".repeat(LIMITES_DO_PEDIDO.mensagem + 1) })).toMatchObject({ ok: false, campo: "mensagem" });
    expect(validarPedido({ ...VALIDO, telefone: "4".repeat(LIMITES_DO_PEDIDO.telefone + 1) })).toMatchObject({ ok: false, campo: "telefone" });
    expect(validarPedido({ ...VALIDO, email: `${"a".repeat(LIMITES_DO_PEDIDO.email)}@exemplo.com` })).toMatchObject({ ok: false, campo: "email" });
  });

  it("mensagem curta demais não diz à equipe o que fazer", () => {
    expect(validarPedido({ ...VALIDO, mensagem: "  oi  " })).toMatchObject({ ok: false, campo: "mensagem" });
  });

  it("campo que não é texto (arquivo, ausente) vira vazio, sem lançar", () => {
    const r = validarPedido({ ...VALIDO, nome: new Blob(["x"]), documento: undefined });
    expect(r).toMatchObject({ ok: false, campo: "nome" });
  });
});

describe("descricaoDoPedido", () => {
  it("traz a marca do link público e os dados legíveis para a equipe", () => {
    const r = validarPedido({ ...VALIDO, documento: "11222333000181" });
    if (!r.ok) throw new Error("pedido de exemplo inválido");
    const texto = descricaoDoPedido(r.pedido);
    expect(texto.startsWith(MARCA_DO_PEDIDO_PUBLICO)).toBe(true);
    expect(texto).toContain("não tem acesso ao portal");
    expect(texto).toContain("Nome: Maria da Silva");
    expect(texto).toContain("E-mail: maria@exemplo.com.br");
    expect(texto).toContain("Telefone ou WhatsApp: (41) 99999-0000");
    expect(texto).toContain("Empresa: Padaria Exemplo");
    expect(texto).toContain("CNPJ: 11.222.333/0001-81");
    expect(texto.endsWith("Mensagem:\nQuero abrir uma padaria em Curitiba, com dois sócios.")).toBe(true);
  });

  it("sem documento, diz que não foi informado", () => {
    const r = validarPedido(VALIDO);
    if (!r.ok) throw new Error("pedido de exemplo inválido");
    expect(descricaoDoPedido(r.pedido)).toContain("CPF ou CNPJ: não informado");
  });
});
