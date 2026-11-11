import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jobIdValido, resumirErroZod, validar } from "./robo";
import { AppError } from "./servidor/erros";

describe("porta do robô", () => {
  it("resume o erro do Zod pelo caminho do campo", () => {
    const r = z.object({ pastas: z.array(z.object({ nomePasta: z.string().min(1) })) }).safeParse({ pastas: [{ nomePasta: "" }] });
    expect(r.success).toBe(false);
    expect(resumirErroZod(r.error!)).toMatch(/^Dados inválidos — pastas\.0\.nomePasta: /);
  });

  it("validar devolve o dado ou lança AppError 400", () => {
    expect(validar(z.object({ host: z.string() }), { host: "PC" })).toEqual({ host: "PC" });
    try {
      validar(z.object({ host: z.string() }), {});
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).statusCode).toBe(400);
    }
  });

  it("id de job só como UUID", () => {
    expect(jobIdValido("3f2b6a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b")).toBe("3f2b6a2e-1c4d-4e5f-8a9b-0c1d2e3f4a5b");
    expect(() => jobIdValido("../../etc")).toThrow("Id de job inválido.");
  });
});
