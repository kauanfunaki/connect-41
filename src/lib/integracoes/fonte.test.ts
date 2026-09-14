import { describe, it, expect, vi } from "vitest";
import { escolherCredencial } from "./fonte";

const CAMPOS = ["baseUrl", "token"] as const;
const ANTIGO = { baseUrl: "https://antigo", token: "t-antigo" };
const NOVO = { baseUrl: "https://novo", token: "t-novo" };

describe("escolherCredencial", () => {
  // O script criou tudo desligado. Se o `enabled` não fosse respeitado, o deploy
  // trocaria a fonte de todo cliente de uma vez, sem ninguém conferir a vitrine.
  it("integração desligada usa a fonte antiga, mesmo completa", () => {
    const e = escolherCredencial({ enabled: false, config: NOVO }, CAMPOS, () => ANTIGO);
    expect(e).toEqual({ fonte: "legado", valores: ANTIGO, integracaoIncompleta: false });
  });

  it("integração ligada e completa ganha, e a fonte antiga nem é lida", () => {
    const legado = vi.fn(() => ANTIGO);
    const e = escolherCredencial({ enabled: true, config: NOVO }, CAMPOS, legado);
    expect(e).toEqual({ fonte: "integracao", valores: NOVO });
    // A fonte antiga do Chatwoot é cifrada: lê-la à toa é arriscar exceção.
    expect(legado).not.toHaveBeenCalled();
  });

  it("integração ligada e incompleta cai na fonte antiga e avisa", () => {
    const e = escolherCredencial({ enabled: true, config: { baseUrl: "https://novo" } }, CAMPOS, () => ANTIGO);
    expect(e).toEqual({ fonte: "legado", valores: ANTIGO, integracaoIncompleta: true });
  });

  // Nunca mistura: URL nova com token antigo autentica contra o servidor errado.
  it("não mistura campos das duas fontes", () => {
    const e = escolherCredencial({ enabled: true, config: { baseUrl: "https://novo", token: "" } }, CAMPOS, () => ANTIGO);
    expect(e?.valores).toEqual(ANTIGO);
  });

  it("campo só com espaço conta como faltando", () => {
    const e = escolherCredencial({ enabled: true, config: { baseUrl: "https://novo", token: "   " } }, CAMPOS, () => ANTIGO);
    expect(e?.fonte).toBe("legado");
  });

  it("sem integração usa a fonte antiga", () => {
    expect(escolherCredencial(null, CAMPOS, () => ANTIGO)?.fonte).toBe("legado");
  });

  it("sem nenhuma das duas, não há credencial", () => {
    expect(escolherCredencial(null, CAMPOS, () => null)).toBeNull();
    expect(escolherCredencial({ enabled: true, config: {} }, CAMPOS, () => null)).toBeNull();
  });
});
