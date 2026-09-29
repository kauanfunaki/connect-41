import { afterEach, describe, expect, it, vi } from "vitest";
// A classe que o Next lança no navegador quando a action não existe mais no
// servidor (router-reducer/server-action-reducer).
import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { EVENTO_VERSAO_NOVA, ehVersaoAntiga, tratarVersaoAntiga } from "./versaoNova";

const erroDeVersaoAntiga = () =>
  new UnrecognizedActionError('Server Action "0070fc" was not found on the server.');

describe("versão antiga do Connect", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reconhece a action que o servidor não tem mais", () => {
    expect(ehVersaoAntiga(erroDeVersaoAntiga())).toBe(true);
  });

  it("não confunde com erro comum nem com o texto da mensagem", () => {
    expect(ehVersaoAntiga(new Error("Failed to fetch"))).toBe(false);
    expect(ehVersaoAntiga(new Error('Server Action "0070fc" was not found on the server.'))).toBe(false);
    expect(ehVersaoAntiga(null)).toBe(false);
  });

  it("avisa a tela só quando é versão antiga", () => {
    const alvo = new EventTarget();
    const ouvinte = vi.fn();
    alvo.addEventListener(EVENTO_VERSAO_NOVA, ouvinte);
    vi.stubGlobal("window", alvo);

    expect(tratarVersaoAntiga(new Error("rede"))).toBe(false);
    expect(ouvinte).not.toHaveBeenCalled();

    expect(tratarVersaoAntiga(erroDeVersaoAntiga())).toBe(true);
    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it("no servidor, sem window, só responde", () => {
    expect(tratarVersaoAntiga(erroDeVersaoAntiga())).toBe(true);
  });
});
