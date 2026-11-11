import { describe, expect, it } from "vitest";
import { GRUPO_DA_SECAO, SECOES_DO_PORTAL, TELAS_DO_PORTAL, grupoDoCaminho, menuDoPortal, telasVisiveis } from "./telas";

describe("grupoDoCaminho (cor por grupo, 21/10/2026)", () => {
  it("dá o grupo da tela e dos detalhes dela", () => {
    expect(grupoDoCaminho("/portal/pagar")).toBe("financeiro");
    expect(grupoDoCaminho("/portal/documentos")).toBe("fiscal");
    expect(grupoDoCaminho("/portal/processos/abc123")).toBe("processos");
    expect(grupoDoCaminho("/portal/solicitacoes/nova")).toBe("atendimento");
  });

  it("as Aprovações são do financeiro, embora morem em “Com a equipe”", () => {
    expect(grupoDoCaminho("/portal/aprovacoes")).toBe("financeiro");
  });

  it("o Início, Minha conta e Ajuda ficam na cor principal", () => {
    expect(grupoDoCaminho("/portal")).toBeNull();
    expect(grupoDoCaminho("/portal/conta")).toBeNull();
    expect(grupoDoCaminho("/portal/ajuda")).toBeNull();
  });

  it("não confunde o começo do nome com a tela", () => {
    expect(grupoDoCaminho("/portal/pagarx")).toBeNull();
  });

  it("toda tela do catálogo, fora o Início, tem grupo", () => {
    for (const t of TELAS_DO_PORTAL.filter((t) => t.href !== "/portal")) expect(t.grupo, t.href).not.toBeNull();
  });

  it("toda seção do menu tem a cor de um grupo", () => {
    for (const s of SECOES_DO_PORTAL) expect(GRUPO_DA_SECAO[s]).toBeTruthy();
  });
});

describe("menuDoPortal — o que pede ação sobe (11/11/2026)", () => {
  const TODOS = new Set(TELAS_DO_PORTAL.flatMap((t) => (t.modulo ? [t.modulo] : [])));
  const hrefs = (ts: { href: string }[]) => ts.map((t) => t.href);

  it("Pendências, Aprovações e Solicitações logo depois do Início, antes dos documentos fiscais", () => {
    // Sem a Conversa: com as solicitações ligadas, ela sai do menu.
    const menu = menuDoPortal(telasVisiveis(TODOS));
    expect(hrefs(menu.topo)).toEqual(["/portal", "/portal/pendencias", "/portal/aprovacoes", "/portal/solicitacoes", "/portal/documentos"]);
  });

  it("as que subiram não se repetem em “Com a equipe”, e a seção fica com o resto", () => {
    const menu = menuDoPortal(telasVisiveis(TODOS));
    const comAEquipe = menu.secoes.find((s) => s.secao === "Com a equipe")!;
    expect(hrefs(comAEquipe.telas)).toEqual(["/portal/comunicados", "/portal/envios", "/portal/arquivos"]);
    const todas = [...menu.topo, ...menu.secoes.flatMap((s) => s.telas)];
    expect(new Set(hrefs(todas)).size).toBe(todas.length);
    expect(todas).toHaveLength(telasVisiveis(TODOS).length);
  });

  it("só sobe o que está no menu, e a seção vazia some", () => {
    const menu = menuDoPortal(telasVisiveis(new Set(["bpo_aprovacoes"])));
    expect(hrefs(menu.topo)).toEqual(["/portal", "/portal/aprovacoes", "/portal/documentos"]);
    expect(menu.secoes).toEqual([]);
  });

  it("a seção da tela não muda: só o menu do cliente a tira de lá", () => {
    expect(TELAS_DO_PORTAL.find((t) => t.href === "/portal/pendencias")?.secao).toBe("Com a equipe");
  });
});

describe("os nomes do menu em palavras do cliente (11/11/2026)", () => {
  const rotulo = (href: string) => TELAS_DO_PORTAL.find((t) => t.href === href)?.rotulo;

  it("DRE, Relatório e Exigências trocados", () => {
    expect(rotulo("/portal/dre")).toBe("Resultado do mês (DRE)");
    expect(rotulo("/portal/relatorios")).toBe("Resumo do mês por empresa");
    expect(rotulo("/portal/exigencias")).toBe("O que os órgãos pediram");
  });

  it("nenhuma descrição fala em “baixa”", () => {
    for (const t of TELAS_DO_PORTAL) expect(t.descricao, t.href).not.toMatch(/\bbaixa\b/i);
  });
});
