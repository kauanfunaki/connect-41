import { afterEach, describe, expect, it, vi } from "vitest";
import { authUrl } from "./oauth";

describe("autorização OAuth do GitHub", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("a conexão do escritório pede repo e volta ao callback cadastrado", () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://connect.example.test");
    const url = new URL(authUrl("estado", "verificador-com-tamanho-suficiente", "cliente"));
    expect(url.searchParams.get("scope")).toBe("read:user repo");
    expect(url.searchParams.get("redirect_uri")).toBe("https://connect.example.test/api/integrations/github/callback");
  });
  it("o vínculo de Sua conta não pede escopo e volta a um subcaminho do callback", () => {
    vi.stubEnv("APP_PUBLIC_URL", "https://connect.example.test");
    const url = new URL(authUrl("estado", "verificador-com-tamanho-suficiente", "cliente", "account"));
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.get("redirect_uri")).toBe("https://connect.example.test/api/integrations/github/callback/conta");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });
});
