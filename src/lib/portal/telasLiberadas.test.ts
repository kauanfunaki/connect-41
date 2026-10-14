import { describe, expect, it } from "vitest";
import { TELAS_DO_PORTAL, TELAS_SEMPRE_LIBERADAS, telaBloqueavel, telasVisiveis } from "./telas";
import { blocosDoInicio } from "./inicio";
import { passosDoPortal } from "./ajuda";
import { resumoDasLiberadas, telasParaLiberar } from "./telasLiberadas";
import { tutorialDoPortal } from "@/lib/tutorial/tutoriais";

// Telas liberadas aos poucos (14/10/2026): a tela que o escritório bloqueia
// some do menu, do Início, da ajuda e do tutorial — e o Início, Minha conta e
// Ajuda nunca se bloqueiam. Sem bloqueio, tudo como antes.

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
const hrefs = (modulos: ReadonlySet<string>, bloqueadas?: string[]) =>
  telasVisiveis(modulos, bloqueadas ? new Set(bloqueadas) : undefined).map((t) => t.href);

describe("quais telas podem ser bloqueadas", () => {
  it("Início, Minha conta e Ajuda nunca", () => {
    for (const href of ["/portal", "/portal/conta", "/portal/ajuda"]) expect(telaBloqueavel(href)).toBe(false);
    expect([...TELAS_SEMPRE_LIBERADAS].sort()).toEqual(["/portal", "/portal/ajuda", "/portal/conta"]);
  });

  it("todas as outras do catálogo, inclusive os documentos fiscais", () => {
    const bloqueaveis = TELAS_DO_PORTAL.filter((t) => telaBloqueavel(t.href)).map((t) => t.href);
    expect(bloqueaveis).toHaveLength(TELAS_DO_PORTAL.length - 1);
    expect(bloqueaveis).toContain("/portal/documentos");
  });

  it("endereço fora do catálogo não é tela", () => {
    expect(telaBloqueavel("/portal/inventada")).toBe(false);
    expect(telaBloqueavel("/admin")).toBe(false);
  });
});

describe("o menu (telasVisiveis)", () => {
  it("sem bloqueio, é o menu de antes", () => {
    expect(hrefs(TODOS, [])).toEqual(hrefs(TODOS));
    expect(hrefs(TODOS)).toContain("/portal/dre");
  });

  it("a tela bloqueada sai do menu", () => {
    const menu = hrefs(TODOS, ["/portal/dre", "/portal/pendencias", "/portal/documentos"]);
    expect(menu).not.toContain("/portal/dre");
    expect(menu).not.toContain("/portal/pendencias");
    expect(menu).not.toContain("/portal/documentos");
    expect(menu).toContain("/portal/fluxo-de-caixa");
  });

  it("o Início fica mesmo que venha na lista de bloqueadas", () => {
    expect(hrefs(new Set(), ["/portal"])).toEqual(["/portal", "/portal/documentos"]);
  });

  it("liberar não faz aparecer a tela de módulo desligado", () => {
    expect(hrefs(new Set(), [])).not.toContain("/portal/dre");
  });
});

describe("o Início", () => {
  const blocos = (bloqueadas: string[]) => blocosDoInicio(new Set(hrefs(TODOS, bloqueadas)));

  it("sem bloqueio, tudo o que os módulos dão", () => {
    const b = blocos([]);
    expect(b.atencao).toEqual({ aprovacoes: true, pendencias: true, solicitacoes: true, processos: true, envios: true, comunicados: true });
    expect(b.documentos).toBe(true);
    expect(b.societario).toBe(true);
    expect(b.pedir?.href).toBe("/portal/solicitacoes/nova");
  });

  it("tela bloqueada não entra no 'O que precisa de você', nos blocos nem nos atalhos", () => {
    const b = blocos(["/portal/aprovacoes", "/portal/pendencias", "/portal/processos", "/portal/documentos", "/portal/solicitacoes", "/portal/dre"]);
    expect(b.atencao.aprovacoes).toBe(false);
    expect(b.atencao.pendencias).toBe(false);
    expect(b.atencao.processos).toBe(false);
    expect(b.atencao.solicitacoes).toBe(false);
    expect(b.societario).toBe(false);
    expect(b.documentos).toBe(false);
    // Sem as solicitações liberadas, a Conversa continua fora (foi trocada por elas).
    expect(b.pedir).toBeNull();
    expect(b.financeiro?.atalhos.map((a) => a.href)).not.toContain("/portal/dre");
  });

  it("todo o financeiro bloqueado: o bloco do financeiro some", () => {
    const b = blocos(["/portal/pagar", "/portal/receber", "/portal/cobranca", "/portal/fluxo-de-caixa", "/portal/relatorios", "/portal/dre"]);
    expect(b.financeiro).toBeNull();
  });

  it("cobrança bloqueada: o 'a receber em atraso' leva às contas a receber", () => {
    expect(blocos(["/portal/cobranca"]).financeiro?.receberEmAtraso).toBe("/portal/receber");
  });
});

describe("a ajuda (passosDoPortal)", () => {
  const chaves = (bloqueadas: string[]) =>
    passosDoPortal(TODOS, { variasEmpresas: false, bloqueadas: new Set(bloqueadas) }).map((p) => p.chave);

  it("sem bloqueio, os mesmos passos de antes", () => {
    expect(chaves([])).toEqual(passosDoPortal(TODOS, { variasEmpresas: false }).map((p) => p.chave));
  });

  it("o passo que só ensina uma tela bloqueada sai", () => {
    const c = chaves(["/portal/aprovacoes", "/portal/pendencias", "/portal/documentos", "/portal/arquivos"]);
    expect(c).not.toContain("aprovar");
    expect(c).not.toContain("pendencia");
    expect(c).not.toContain("documentos");
    expect(c).not.toContain("arquivos");
    expect(c).toContain("solicitacao");
    // Os de qualquer portal ficam.
    expect(c).toEqual(expect.arrayContaining(["entrar", "inicio", "conta", "senha"]));
  });

  it("no financeiro, só a linha da tela bloqueada sai; com todas bloqueadas, o passo sai", () => {
    const [financeiro] = passosDoPortal(TODOS, { variasEmpresas: false, bloqueadas: new Set(["/portal/dre"]) }).filter(
      (p) => p.chave === "financeiro"
    );
    expect(financeiro.passos.some((l) => l.startsWith("A DRE"))).toBe(false);
    expect(financeiro.passos.some((l) => l.startsWith("Fluxo de caixa"))).toBe(true);
    expect(chaves(["/portal/pagar", "/portal/receber", "/portal/cobranca", "/portal/fluxo-de-caixa", "/portal/relatorios", "/portal/dre"])).not.toContain(
      "financeiro"
    );
  });

  it("linhas que apontam para outra tela bloqueada saem do passo", () => {
    const passos = passosDoPortal(TODOS, { variasEmpresas: false, bloqueadas: new Set(["/portal/exigencias", "/portal/solicitacoes"]) });
    const processo = passos.find((p) => p.chave === "processo")!;
    expect(processo.passos.some((l) => l.includes("Exigências"))).toBe(false);
    const comunicado = passos.find((p) => p.chave === "comunicado")!;
    expect(comunicado.passos.some((l) => l.includes("Abra uma solicitação"))).toBe(false);
  });
});

describe("o tutorial do primeiro acesso", () => {
  const chaves = (bloqueadas?: string[]) =>
    tutorialDoPortal({
      escritorio: null,
      modulos: TODOS,
      bloqueadas: bloqueadas ? new Set(bloqueadas) : undefined,
      avisosNoCelular: false,
    }).passos.map((p) => p.chave);

  it("sem bloqueio, os passos de antes", () => {
    expect(chaves([])).toEqual(chaves());
  });

  it("os passos das telas bloqueadas saem", () => {
    const c = chaves(["/portal/solicitacoes", "/portal/pendencias", "/portal/processos"]);
    expect(c).not.toContain("solicitacoes");
    expect(c).not.toContain("pendencias");
    expect(c).not.toContain("processos");
    expect(c).toContain("boas-vindas");
    expect(c).toContain("pronto");
  });

  it("os documentos: cada item segue a tela dele, e o passo sai sem nenhum", () => {
    const passo = (bloqueadas: string[]) =>
      tutorialDoPortal({ escritorio: null, modulos: TODOS, bloqueadas: new Set(bloqueadas), avisosNoCelular: false }).passos.find(
        (p) => p.chave === "documentos"
      );
    expect(passo(["/portal/documentos"])?.itens?.some((i) => i.startsWith("Documentos fiscais"))).toBe(false);
    expect(passo(["/portal/documentos", "/portal/envios", "/portal/arquivos"])).toBeUndefined();
  });

  it("aprovações bloqueadas: o financeiro entra no lugar, só com as telas liberadas", () => {
    const t = tutorialDoPortal({
      escritorio: null,
      modulos: TODOS,
      bloqueadas: new Set(["/portal/aprovacoes", "/portal/dre"]),
      avisosNoCelular: false,
    });
    const financeiro = t.passos.find((p) => p.chave === "financeiro")!;
    expect(financeiro.texto).not.toContain("DRE");
    expect(t.passos.some((p) => p.chave === "aprovacoes")).toBe(false);
  });
});

describe("a lista da administração (telasParaLiberar)", () => {
  it("agrupa como o menu, com o Início sempre liberado e sem interruptor", () => {
    const grupos = telasParaLiberar(TODOS, new Set());
    expect(grupos.map((g) => g.titulo)).toEqual(["Telas gerais", "Financeiro", "Societário", "Com a equipe"]);
    const inicio = grupos[0]!.telas.find((t) => t.href === "/portal")!;
    expect(inicio).toMatchObject({ bloqueavel: false, liberada: true });
    expect(grupos.flatMap((g) => g.telas)).toHaveLength(TELAS_DO_PORTAL.length);
  });

  it("marca as bloqueadas e conta as liberadas", () => {
    const grupos = telasParaLiberar(TODOS, new Set(["/portal/dre", "/portal/pendencias"]));
    const todas = grupos.flatMap((g) => g.telas);
    expect(todas.find((t) => t.href === "/portal/dre")?.liberada).toBe(false);
    expect(todas.find((t) => t.href === "/portal/fluxo-de-caixa")?.liberada).toBe(true);
    expect(resumoDasLiberadas(grupos)).toEqual({ liberadas: TELAS_DO_PORTAL.length - 3, total: TELAS_DO_PORTAL.length - 1 });
  });

  it("avisa a tela que já não aparece pelo módulo desligado, ou por ter sido trocada", () => {
    const todas = telasParaLiberar(new Set(["portal_solicitacoes", "bpo_comunicacao"]), new Set()).flatMap((g) => g.telas);
    expect(todas.find((t) => t.href === "/portal/dre")?.foraDoMenu).toBe("O módulo está desligado — a tela já não aparece.");
    expect(todas.find((t) => t.href === "/portal/comunicacao")?.foraDoMenu).toMatch(/trocada por “Solicitações”/);
    expect(todas.find((t) => t.href === "/portal/solicitacoes")?.foraDoMenu).toBeNull();
  });

  it("diz o que a equipe ainda manda para a tela bloqueada (e-mail, aviso)", () => {
    const todas = telasParaLiberar(TODOS, new Set()).flatMap((g) => g.telas);
    expect(todas.find((t) => t.href === "/portal/pendencias")?.avisoAoBloquear).toMatch(/pendências/);
    expect(todas.find((t) => t.href === "/portal/aprovacoes")?.avisoAoBloquear).toMatch(/não consegue aprovar/);
    expect(todas.find((t) => t.href === "/portal/dre")?.avisoAoBloquear).toBeNull();
    expect(todas.find((t) => t.href === "/portal")?.avisoAoBloquear).toBeNull();
  });
});
