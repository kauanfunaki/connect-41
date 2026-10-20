import { describe, expect, it } from "vitest";
import { bancoFiscalLocal } from "./ambiente";

describe("isolamento da simulação fiscal", () => {
  it("aceita apenas o banco e a porta locais de demonstração", () => {
    expect(bancoFiscalLocal("mysql://test:test@127.0.0.1:3307/connect41")).toBe(true);
    expect(bancoFiscalLocal("mysql://test:test@localhost:3307/connect41")).toBe(true);
    for (const url of ["", "mysql://test:test@servidor:3307/connect41", "mysql://test:test@localhost:3306/connect41", "mysql://test:test@localhost:3307/xml_vault", "mysql://test:test@localhost.evil:3307/connect41", "postgres://test:test@localhost:3307/connect41"]) {
      expect(bancoFiscalLocal(url), url).toBe(false);
    }
  });
});
