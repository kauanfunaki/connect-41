import { describe, expect, it, vi } from "vitest";
import { GithubClient, githubRetryAt } from "./client";

describe("cliente GitHub", () => {
  it("só envia a credencial para a API oficial, sem cache ou redirecionamento", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ node_id: "U_test", login: "ficticio", type: "User" }));
    const client = new GithubClient("segredo-ficticio", fetcher);
    await expect(client.viewer()).resolves.toMatchObject({ externalId: "U_test" });
    expect(fetcher).toHaveBeenCalledWith(new URL("https://api.github.com/user"), expect.objectContaining({ redirect: "error", cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer segredo-ficticio" }) }));
    await expect(client.request("https://evil.test/user")).rejects.toThrow("Endereço");
    await expect(client.request("//evil.test/user")).rejects.toThrow("Endereço");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("lê paginação sem seguir URLs arbitrárias do header Link", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([{}], { headers: { link: '<https://evil.test/steal>; rel="next"' } }));
    const result = await new GithubClient("teste", fetcher).page("/user/repos?page=1");
    expect(result.next).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("separa revogação de autorização, permissão e rate limit", async () => {
    for (const [status, headers, category] of [[401, {}, "auth"], [404, {}, "access"], [403, { "x-github-sso": "required" }, "access"], [403, { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1999999999" }, "limit"], [429, { "retry-after": "30" }, "limit"]] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: "segredo-nao-deve-sair" }, { status, headers }));
      const error = await new GithubClient("teste", fetcher).request("/user").catch(error => error);
      expect(error.category).toBe(category); expect(error.message).not.toContain("segredo-nao-deve-sair");
    }
  });
  it("reconhece limite secundário sem headers específicos e espera pelo menos um minuto", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ message: "You have exceeded a secondary rate limit" }, { status: 403 }));
    const error = await new GithubClient("teste", fetcher).request("/user").catch(error => error);
    expect(error.category).toBe("limit"); expect(error.retryAt.getTime()).toBeGreaterThan(Date.now() + 59000);
    expect(githubRetryAt(new Headers({ "retry-after": "30" }), 1000).getTime()).toBe(31000);
  });
  it("falha sem confirmar lote quando o JSON está truncado ou há mais de 100 itens", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('[{"node_id":')).mockResolvedValueOnce(Response.json(Array(101).fill({})));
    const client = new GithubClient("teste", fetcher);
    await expect(client.page("/user/repos")).rejects.toThrow("Resposta GitHub inválida");
    await expect(client.page("/user/repos")).rejects.toThrow();
  });
});
