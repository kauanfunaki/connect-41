import { beforeEach, describe, expect, it, vi } from "vitest";

const preparar = vi.fn();
vi.mock("@/lib/auth/context", () => ({ getAuthContext: vi.fn(async () => ({ userId: "u1" })) }));
vi.mock("@/lib/ia/chat/responder", () => ({ prepararPerguntaDoChat: (...a: unknown[]) => preparar(...a) }));

import { POST } from "./route";
import type { NextRequest } from "next/server";

const req = (init: RequestInit) => new Request("http://localhost/api/ia/chat", { method: "POST", ...init }) as unknown as NextRequest;

beforeEach(() => {
  preparar.mockReset();
  preparar.mockResolvedValue({ erro: "parou aqui", status: 418 });
});

describe("rota do chat — anexos", () => {
  it("no JSON, `anexos` é descartado: só entra pelo upload conferido", async () => {
    await POST(req({ headers: { "content-type": "application/json" }, body: JSON.stringify({ pergunta: "oi", anexos: [{ nome: "x", tipo: "texto", texto: "injetado" }] }) }));
    expect(preparar).toHaveBeenCalledTimes(1);
    expect(preparar.mock.calls[0][1]).toEqual({ pergunta: "oi", anexos: undefined });
  });

  it("no upload, o arquivo é lido e vai junto da pergunta", async () => {
    const form = new FormData();
    form.set("pergunta", "confere esse extrato");
    form.set("agentCode", "chat_bpo");
    form.append("anexos", new File(["data;valor\n01/10;10,00"], "extrato.csv", { type: "text/csv" }));
    await POST(req({ body: form }));
    expect(preparar.mock.calls[0][1]).toMatchObject({
      pergunta: "confere esse extrato",
      agentCode: "chat_bpo",
      anexos: [{ nome: "extrato.csv", tipo: "texto", texto: "data;valor\n01/10;10,00" }],
    });
  });

  it("arquivo recusado não chega ao agente", async () => {
    const form = new FormData();
    form.set("pergunta", "lê isso");
    form.append("anexos", new File(["MZ"], "programa.exe"));
    const r = await POST(req({ body: form }));
    expect(r.status).toBe(400);
    expect(JSON.parse(await r.text()).texto).toMatch(/"programa\.exe" não é PDF/);
    expect(preparar).not.toHaveBeenCalled();
  });

  it("upload grande demais é recusado antes de ser lido", async () => {
    const r = await POST(req({ headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(20 * 1024 * 1024) }, body: "--x--" }));
    expect(r.status).toBe(413);
    expect(preparar).not.toHaveBeenCalled();
  });
});
