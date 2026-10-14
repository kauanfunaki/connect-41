import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TELAS_DO_PORTAL, telaBloqueavel } from "@/lib/portal/telas";

// A tela bloqueada pelo escritório (14/10/2026), aberta pelo endereço direto —
// favorito, link do e-mail, aviso no celular. Cada tela e cada download dela
// pergunta no servidor, antes de consultar qualquer dado: a tela devolve
// "Esta tela ainda não está disponível" e o download, 404. O layout não serve
// para isso — não roda de novo a cada navegação entre telas.
//
// O banco aqui é um espião: qualquer tabela lida além da das telas bloqueadas
// fica anotada. Tela bloqueada não pode ler nada dela.

const SESSAO = { kind: "portal" as const, sub: "pu1", tenantId: "t1", clientGroupId: "g1" };
const TODOS = new Set([
  "bpo_dre",
  "bpo_fluxo_caixa",
  "bpo_contas_pagar",
  "bpo_contas_receber",
  "bpo_cobranca",
  "societario_processos",
  "portal_solicitacoes",
  "arquivos",
  "bpo_pendencias",
  "bpo_aprovacoes",
  "bpo_comunicacao",
]);

const m = vi.hoisted(() => ({
  bloqueadas: [] as string[],
  lidas: [] as string[],
}));

vi.mock("@/lib/prisma", () => {
  // Toda tabela fora a das telas bloqueadas responde erro — e fica anotada.
  const tabela = (nome: string) =>
    new Proxy(
      {},
      {
        get: () => () => {
          m.lidas.push(nome);
          return Promise.reject(new Error(`consultou ${nome}`));
        },
      }
    );
  const banco = new Proxy(
    {},
    {
      get: (_, prop: string) =>
        prop === "portalTelaBloqueada"
          ? { findMany: async () => m.bloqueadas.map((href) => ({ href })) }
          : tabela(prop),
    }
  );
  return { getPrisma: () => banco };
});
vi.mock("@/app/(portal)/usuario", () => ({
  sessaoAtivaDoPortal: async () => SESSAO,
  clienteAtivoDoPortal: async () => ({
    sessao: SESSAO,
    tenantId: "t1",
    usuario: { id: "pu1", name: "Cliente", email: "cliente@exemplo.com" },
    companyIds: ["c1"],
    modulos: TODOS,
  }),
}));
vi.mock("@/app/(portal)/financeiro", () => ({
  contextoFinanceiroDoPortal: async () => ({ sessao: SESSAO, escopo: { tenantId: "t1", companyIds: ["c1"] }, modulos: TODOS }),
}));
vi.mock("@/app/(portal)/alcance", () => ({
  alcanceDoCliente: async () => ({ tipo: "EMPRESAS", tenantId: "t1", companyIds: ["c1"] }),
}));
vi.mock("@/lib/modules", () => ({ getEnabledModuleCodes: async () => TODOS }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

const { TelaIndisponivel } = await import("@/components/portal/TelaIndisponivel");

const AREA = path.join(process.cwd(), "src", "app", "(portal)", "portal", "(area)");
const pastaDaTela = (href: string) => path.join(AREA, href.replace(/^\/portal\//, ""));

/** As telas (`page.tsx`) e os downloads (`route.ts`) dentro da pasta, em qualquer nível. */
function arquivosDaTela(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = path.join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivosDaTela(caminho);
    return nome === "page.tsx" || nome === "route.ts" ? [caminho] : [];
  });
}

const BLOQUEAVEIS = TELAS_DO_PORTAL.filter((t) => telaBloqueavel(t.href));
const relativo = (arquivo: string) => path.relative(AREA, arquivo).replaceAll("\\", "/");
const PAGINAS = BLOQUEAVEIS.flatMap((t) =>
  arquivosDaTela(pastaDaTela(t.href))
    .filter((a) => a.endsWith("page.tsx"))
    .map((a) => ({ href: t.href, arquivo: relativo(a) }))
);
const ROTAS = BLOQUEAVEIS.flatMap((t) =>
  arquivosDaTela(pastaDaTela(t.href))
    .filter((a) => a.endsWith("route.ts"))
    .map((a) => ({ href: t.href, arquivo: relativo(a) }))
);

const argumentos = { params: Promise.resolve({ id: "id-qualquer" }), searchParams: Promise.resolve({}) };

beforeEach(() => {
  m.bloqueadas = [];
  m.lidas = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("toda tela e todo download do portal perguntam se a tela está liberada", () => {
  it("o catálogo e as pastas batem: cada pasta de tela é uma tela do catálogo", () => {
    const pastas = readdirSync(AREA).filter((n) => statSync(path.join(AREA, n)).isDirectory() && !n.startsWith("["));
    const doCatalogo = new Set(TELAS_DO_PORTAL.map((t) => t.href.replace(/^\/portal\/?/, "")));
    // Minha conta e Ajuda ficam fora do catálogo de propósito: nunca se bloqueiam.
    expect(pastas.filter((p) => !doCatalogo.has(p) && p !== "conta" && p !== "ajuda")).toEqual([]);
  });

  it.each(BLOQUEAVEIS.map((t) => t.href))("%s: cada arquivo pergunta pela própria tela", (href) => {
    const arquivos = arquivosDaTela(pastaDaTela(href));
    expect(arquivos.length).toBeGreaterThan(0);
    const chamada = new RegExp(`telaBloqueadaNoPortal\\([^)]*"${href.replaceAll("/", "\\/")}"\\)`);
    expect(arquivos.filter((a) => !chamada.test(readFileSync(a, "utf8"))).map(relativo)).toEqual([]);
  });
});

describe("tela bloqueada aberta pelo endereço", () => {
  it.each(PAGINAS)("$arquivo: 'ainda não está disponível', sem ler nada da tela", async ({ href, arquivo }) => {
    m.bloqueadas = [href];
    const { default: Pagina } = await import(/* @vite-ignore */ `./${arquivo.replace(/\.tsx$/, "")}`);
    const resultado = await Pagina(argumentos);
    expect(resultado?.type).toBe(TelaIndisponivel);
    expect(m.lidas).toEqual([]);
  });

  it.each(ROTAS)("$arquivo: 404, sem ler nada", async ({ href, arquivo }) => {
    m.bloqueadas = [href];
    const rota = await import(/* @vite-ignore */ `./${arquivo.replace(/\.ts$/, "")}`);
    const metodo = rota.GET ?? rota.POST;
    const resposta: Response = await metodo(new Request("http://localhost/portal"), argumentos);
    expect(resposta.status).toBe(404);
    expect(m.lidas).toEqual([]);
  });

  it("outra tela bloqueada não barra esta: a DRE liberada segue para os dados dela", async () => {
    m.bloqueadas = ["/portal/fluxo-de-caixa"];
    const { default: Pagina } = await import("./dre/page");
    await Pagina(argumentos).catch(() => null);
    expect(m.lidas.length).toBeGreaterThan(0);
  });

  it("download liberado segue para o arquivo", async () => {
    m.bloqueadas = ["/portal/dre"];
    const { GET } = await import("./pendencias/anexos/[id]/route");
    await GET(new Request("http://localhost/portal") as never, argumentos).catch(() => null);
    expect(m.lidas).toContain("clientRequestAttachment");
  });
});
