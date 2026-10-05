import { describe, expect, it } from "vitest";
import { passosDoPortal } from "./ajuda";
import { TELAS_DO_PORTAL, telasVisiveis } from "./telas";

const chaves = (modulos: string[], variasEmpresas = false) =>
  passosDoPortal(new Set(modulos), { variasEmpresas }).map((p) => p.chave);

describe("passosDoPortal — o cliente só lê sobre o que está no menu dele", () => {
  it("sem módulo nenhum: só o que vale para qualquer portal", () => {
    expect(chaves([])).toEqual(["entrar", "inicio", "instalar", "avisos", "documentos", "senha"]);
  });

  it("só o Societário: processos entram, nada do financeiro", () => {
    const c = chaves(["societario_processos"]);
    expect(c).toContain("processo");
    expect(c).not.toContain("financeiro");
    expect(c).not.toContain("pendencia");
    expect(c).not.toContain("aprovar");
  });

  it("BPO completo: pendência, aprovação, conversa e financeiro", () => {
    const c = chaves(["bpo_pendencias", "bpo_aprovacoes", "bpo_comunicacao", "bpo_contas_pagar", "bpo_dre"]);
    expect(c).toEqual(expect.arrayContaining(["pendencia", "aprovar", "conversa", "financeiro"]));
    expect(c).not.toContain("processo");
  });

  it("com as solicitações ligadas, o passo delas entra e o da conversa sai", () => {
    const sem = chaves(["bpo_comunicacao"]);
    expect(sem).toContain("conversa");
    expect(sem).not.toContain("solicitacao");
    const com = chaves(["bpo_comunicacao", "portal_solicitacoes"]);
    expect(com).toContain("solicitacao");
    expect(com).not.toContain("conversa");
  });

  it("só com o canal do portal, o passo de responder um pedido da 41 aparece", () => {
    expect(chaves(["portal_solicitacoes"])).toContain("pendencia");
  });

  it("trocar de empresa só aparece para quem tem mais de uma", () => {
    expect(chaves([])).not.toContain("empresa");
    expect(chaves([], true)).toContain("empresa");
  });

  it("no financeiro, cada linha depende da tela dela", () => {
    const [financeiro] = passosDoPortal(new Set(["bpo_dre"]), { variasEmpresas: false }).filter((p) => p.chave === "financeiro");
    expect(financeiro.passos.some((l) => l.startsWith("A DRE"))).toBe(true);
    expect(financeiro.passos.some((l) => l.startsWith("Contas a pagar"))).toBe(false);
    expect(financeiro.passos.some((l) => l.startsWith("Cobrança"))).toBe(false);
    // A linha sem módulo (fale com a equipe) fica sempre.
    expect(financeiro.passos.at(-1)).toMatch(/fale com a equipe/);
  });

  it("a primeira tela é o Início, e nenhum passo manda o cliente aos documentos para começar (05/10)", () => {
    const todos = passosDoPortal(new Set(TELAS_DO_PORTAL.flatMap((t) => (t.modulo ? [t.modulo] : []))), { variasEmpresas: true });
    // Primeiro o passo de como entrar (vídeo 01), e logo depois o Início.
    expect(todos.slice(0, 2).map((p) => p.chave)).toEqual(["entrar", "inicio"]);
    const texto = todos.flatMap((p) => p.passos).join("\n");
    expect(texto).not.toMatch(/primeira tela do portal/);
    expect(texto).not.toMatch(/Na tela Documentos fiscais/);
  });

  it("no Início, a linha do financeiro e a dos processos dependem do módulo", () => {
    const linhas = (m: string[]) => passosDoPortal(new Set(m), { variasEmpresas: false }).find((p) => p.chave === "inicio")!.passos;
    expect(linhas([]).some((l) => l.startsWith("Em Financeiro"))).toBe(false);
    expect(linhas(["bpo_contas_pagar"]).some((l) => l.startsWith("Em Financeiro"))).toBe(true);
    expect(linhas(["societario_processos"]).some((l) => l.startsWith("Em Processos"))).toBe(true);
  });

  it("todo passo que aparece tem ao menos uma linha", () => {
    const todos = passosDoPortal(new Set(TELAS_DO_PORTAL.flatMap((t) => (t.modulo ? [t.modulo] : []))), { variasEmpresas: true });
    expect(todos.length).toBe(13);
    for (const p of todos) expect(p.passos.length).toBeGreaterThan(0);
  });
});

describe("telasVisiveis — a mesma régua do menu", () => {
  it("sem módulo, só o Início e os documentos fiscais — o Início primeiro", () => {
    expect(telasVisiveis(new Set()).map((t) => t.href)).toEqual(["/portal", "/portal/documentos"]);
    expect(TELAS_DO_PORTAL[0]).toMatchObject({ href: "/portal", rotulo: "Início" });
  });

  it("um módulo traz todas as telas dele (processos e exigências)", () => {
    expect(telasVisiveis(new Set(["societario_processos"])).map((t) => t.href)).toEqual([
      "/portal",
      "/portal/documentos",
      "/portal/processos",
      "/portal/exigencias",
    ]);
  });

  it("a Conversa sai do menu quando as solicitações estão ligadas", () => {
    const hrefs = (m: string[]) => telasVisiveis(new Set(m)).map((t) => t.href);
    expect(hrefs(["bpo_comunicacao"])).toContain("/portal/comunicacao");
    // As Pendências também entram: com o canal, qualquer setor pede ao cliente.
    expect(hrefs(["bpo_comunicacao", "portal_solicitacoes"])).toEqual([
      "/portal",
      "/portal/documentos",
      "/portal/solicitacoes",
      "/portal/comunicados",
      "/portal/pendencias",
    ]);
  });

  it("toda tela fica dentro de /portal", () => {
    for (const t of TELAS_DO_PORTAL) expect(t.href.startsWith("/portal")).toBe(true);
  });
});
