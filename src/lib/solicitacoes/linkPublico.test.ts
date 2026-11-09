import { describe, expect, it } from "vitest";
import { avisoDoLinkPublico, caminhoDoPedido, enderecoCurtoDoPedido, enderecoDoPedido } from "./linkPublico";

// O endereço do link público de pedido (09/11/2026): o slug do escritório e o
// id do assunto, em APP_PUBLIC_URL.

const ID = "2f9c4e1a-5b6c-4d7e-8f90-a1b2c3d4e5f6";

describe("endereço do link público de pedido", () => {
  it("é o slug do escritório e o id do assunto", () => {
    expect(caminhoDoPedido("escritorio-exemplo", ID)).toBe(`/pedido/escritorio-exemplo/${ID}`);
  });

  it("absoluto em APP_PUBLIC_URL, sem barra dobrada", () => {
    expect(enderecoDoPedido("escritorio", ID, "https://app.exemplo.com.br/")).toBe(`https://app.exemplo.com.br/pedido/escritorio/${ID}`);
  });

  it("sem APP_PUBLIC_URL (ou sem http), só o caminho — a tela completa ao copiar", () => {
    expect(enderecoDoPedido("escritorio", ID, undefined)).toBe(`/pedido/escritorio/${ID}`);
    expect(enderecoDoPedido("escritorio", ID, "app.exemplo.com.br")).toBe(`/pedido/escritorio/${ID}`);
  });

  it("para ler: sem protocolo e com o id cortado", () => {
    expect(enderecoCurtoDoPedido(`https://app.exemplo.com.br/pedido/escritorio/${ID}`)).toBe("app.exemplo.com.br/pedido/escritorio/2f9c4e1a…");
    expect(enderecoCurtoDoPedido("/pedido/escritorio/abc")).toBe("/pedido/escritorio/abc");
  });
});

describe("aviso do link ligado que não recebe pedido", () => {
  it("diz por quê: Solicitações desligadas antes de assunto inativo", () => {
    expect(avisoDoLinkPublico({ ativo: true, solicitacoesLigadas: true })).toBeNull();
    expect(avisoDoLinkPublico({ ativo: false, solicitacoesLigadas: true })).toContain("Assunto inativo");
    expect(avisoDoLinkPublico({ ativo: false, solicitacoesLigadas: false })).toContain("Solicitações estão desligadas");
  });
});
