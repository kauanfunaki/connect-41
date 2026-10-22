import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A rota pública do logo do escritório (22/10/2026): vai nos e-mails ao
// cliente, então responde sem sessão, com cache público, e só serve imagem.
const m = vi.hoisted(() => ({ ler: vi.fn() }));
vi.mock("fs/promises", () => ({ readFile: m.ler }));

import { GET } from "./route";

const pedir = (filename: string) =>
  GET(new NextRequest(`https://connect.exemplo.com.br/api/workspace-logos/${filename}`), { params: Promise.resolve({ filename }) });

describe("GET /api/workspace-logos/[filename]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.ler.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("serve o logo com cache público e tipo da imagem", async () => {
    const res = await pedir("tenant-1.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=86400");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(String(m.ler.mock.calls[0][0])).toMatch(/public[\\/]uploads[\\/]workspaces[\\/]tenant-1\.png$/);
  });
  it.each(["../.env", "tenant.svg", "tenant.png.html", "a%2F..%2Fb.png", "x.jpg/../../y.png"])("recusa nome fora do padrão: %s", async (nome) => {
    const res = await pedir(nome);
    expect(res.status).toBe(400);
    expect(m.ler).not.toHaveBeenCalled();
  });
  it("logo que não existe: 404", async () => {
    m.ler.mockRejectedValue(new Error("ENOENT"));
    expect((await pedir("tenant-2.webp")).status).toBe(404);
  });
});
