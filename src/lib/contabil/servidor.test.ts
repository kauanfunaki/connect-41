import { beforeEach, describe, expect, it, vi } from "vitest";
const estado = vi.hoisted(() => ({
  ativo: true, ligado: true, escrita: true,
  ctx: { userId: "u1", tenantId: "t1", homeTenantId: "t1", role: "ADMIN", sectors: ["contabil"], activeSector: "contabil", subscriptionReadOnly: false, canSelfRegularizeSubscription: false },
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => estado.ctx, podeExcluir: () => estado.ctx.role === "ADMIN" && !estado.ctx.subscriptionReadOnly }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: async (_ctx: unknown, _m: string, nivel: string) => estado.ativo && (estado.ctx.role === "ADMIN" || estado.ctx.role === "READONLY" && nivel === "ver" || estado.ctx.sectors.includes("contabil") && (nivel !== "agir" || !estado.ctx.subscriptionReadOnly)) }));
vi.mock("@/lib/integracoes/data", () => ({ lerConfig: () => ({ baseUrl: "http://sped.fixture", serviceToken: "read-fixture", ...(estado.escrita ? { accountingWriteToken: "write-fixture" } : {}) }) }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({
  tenantIntegration: { findUnique: async () => ({ enabled: estado.ligado, configEnc: "fixture" }) },
  company: { findMany: async () => [{ cnpj: "11.222.333/0001-81" }, { cnpj: "12.345.678/0001-99" }] },
  spedSyncRoot: { findMany: async () => [{ cnpjRaiz: "11222333" }] },
}) }));
import { GET, POST } from "@/app/api/contabil/sped/[operacao]/route";
import { acessoContabil, exigirEmpresa } from "./servidor";
const contexto = { cnpj: "11222333000181", periodo: "2026-01", tipos: ["entradas"], incluir_dominio: true };
const options = (operacao: string) => ({ params: Promise.resolve({ operacao }) });
function request(operacao: string, dados = {}, headers = {}) {
  return new Request("http://localhost/api/contabil/sped/" + operacao, { method: "POST", headers: { host: "localhost", "Content-Type": "application/json", "Idempotency-Key": "e83b926b-3859-478f-a470-70226a3d31b6", ...headers }, body: JSON.stringify({ contexto, ...dados }) });
}
describe("ponte contábil: autorização e preservação dos arquivos", () => {
  beforeEach(() => { estado.ativo = true; estado.ligado = true; estado.escrita = true; estado.ctx.role = "ADMIN"; estado.ctx.sectors = ["contabil"]; estado.ctx.subscriptionReadOnly = false; vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "pedido-ficticio" }))); });
  it("módulo desligado e usuário de outro setor não alcançam a ponte", async () => {
    estado.ativo = false;
    expect((await POST(request("conferir"), options("conferir"))).status).toBe(404);
    estado.ativo = true; estado.ctx.role = "SECTOR_USER"; estado.ctx.sectors = ["fiscal"];
    expect((await POST(request("conferir"), options("conferir"))).status).toBe(404);
  });
  it("restringe o CNPJ às empresas e raízes autorizadas", async () => {
    const acesso = await acessoContabil();
    expect(() => exigirEmpresa(acesso, "12345678000199")).toThrow("Não encontrado");
    expect((await POST(request("conferir", { contexto: { ...contexto, cnpj: "12345678000199" } }), options("conferir"))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("somente leitura pode calcular e exportar sem alterar regras", async () => {
    estado.ctx.role = "READONLY"; estado.ctx.sectors = ["fiscal"];
    expect((await POST(request("conferir"), options("conferir"))).status).toBe(200);
    expect((await POST(request("regra"), options("regra"))).status).toBe(404);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain("/api/consultas/contabil/conferir");
  });
  it("deriva autor e escritório da sessão, e usa o token próprio para escrita", async () => {
    await POST(request("regra", { actor: "intruso", tenant_id: "outro" }), options("regra"));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("tenant_id=t1");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer write-fixture", "X-Connect-Actor": "u1" });
  });
  it("recusa escrita sem credencial e exclusão sem administrador", async () => {
    estado.escrita = false;
    expect((await POST(request("regra"), options("regra"))).status).toBe(503);
    estado.escrita = true; estado.ctx.role = "SECTOR_USER";
    expect((await POST(request("remover-regra"), options("remover-regra"))).status).toBe(403);
  });
  it("recusa origem externa antes de enviar um comando", async () => {
    expect((await POST(request("conferir", {}, { origin: "http://outro.fixture" }), options("conferir"))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("filtra os estabelecimentos do contexto", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ estabelecimentos: [{ cnpj: contexto.cnpj, nome: "Permitida" }, { cnpj: "12345678000199", nome: "Outro escritório" }], competencias: ["2026-01"] }));
    const r = await GET(new Request("http://localhost/api/contabil/sped/contexto"), options("contexto"));
    expect((await r.json()).estabelecimentos).toHaveLength(1);
  });
  it("repassa o download sem alterar bytes, tipo e nome", async () => {
    const bytes = new Uint8Array([0, 255, 195, 40, 13, 10]);
    vi.mocked(fetch).mockImplementation(async url => String(url).includes("/arquivos/") ? new Response(bytes, { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": 'attachment; filename="teste.txt"' } }) : Response.json({ contexto }));
    const r = await GET(new Request("http://localhost/api/contabil/sped/arquivo?cnpj=" + contexto.cnpj + "&id=e83b926b-3859-478f-a470-70226a3d31b6&chave=entradas_2026_01"), options("arquivo"));
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
    expect(r.headers.get("Content-Disposition")).toContain("teste.txt");
  });
});
