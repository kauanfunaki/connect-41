import { beforeEach, describe, expect, it, vi } from "vitest";

// As ferramentas da Ceci do portal (21/10/2026, fase 2): só leitura, presas às
// empresas do acesso, e só o que o portal já mostra ao cliente. Rodam de
// verdade sobre o banco dos dois clientes da fase 1 (`doisClientes.ts`).

import type { bancoDeTeste } from "@/lib/portal/bancoDeTeste";
import { ATAQUES, DIA, EMPRESAS, T, bancoDeDoisClientes, empresa, linhas, soDoAcesso } from "@/lib/portal/doisClientes";

const m = vi.hoisted(() => ({
  banco: null as ReturnType<typeof bancoDeTeste> | null,
  modulos: new Set<string>(),
  bloqueadas: new Set<string>(),
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco!.prisma }));
vi.mock("@/lib/modules", () => ({ getEnabledModuleCodes: async () => m.modulos }));
vi.mock("@/lib/portal/telasBloqueadas", () => ({ lerTelasBloqueadas: async () => ({ bloqueadas: m.bloqueadas, situacao: "ok" }) }));
vi.mock("@/lib/societario/fila", () => ({ feriadosDoTenant: async () => new Set<string>() }));
vi.mock("@/lib/solicitacoes/assuntos", () => ({
  assuntosAtivos: async () => [{ id: "as-1", label: "Dúvida", description: "Qualquer dúvida", sectorCode: "bpo", responseDays: 2 }],
}));

const { FERRAMENTAS_DO_PORTAL, PREFIXO_DO_PORTAL, SOLICITACAO_PREPARADA, abrirPortal } = await import("./ferramentas-portal");
const { viraProposta } = await import("./ferramentas");
const { AGENT_CATALOG, agenteDoCatalogo } = await import("./catalogo");

const TODOS_OS_MODULOS = ["bpo_contas_pagar", "bpo_contas_receber", "bpo_pendencias", "societario_processos", "portal_solicitacoes"];
const DO_PORTAL = { tenantId: T, userId: null, escopo: { portalUserId: "pu-a" } };

/** Uma solicitação com o que é só da equipe: mensagem interna e responsável. */
const serviceRequest = linhas("solicitacao", () => ({
  number: 7,
  status: "AGUARDANDO_CLIENTE",
  sectorCode: "BPO",
  description: "Preciso do informe de rendimentos",
  responseDue: DIA,
  firstResponseAt: null,
  lastMessageAt: DIA,
  createdAt: DIA,
  closedAt: null,
  assigneeId: "u-fulano",
  subject: { label: "Dúvida" },
  assignee: { id: "u-fulano", name: "Fulano Responsável" },
  openedByPortal: { name: "Cliente A" },
  closedBy: null,
  attachments: [],
  messages: [
    { id: "msg-1", body: "Já estamos vendo.", internal: false, createdAt: DIA, authorUser: { name: "Equipe" }, authorPortal: null, attachments: [] },
    { id: "msg-2", body: "NOTA INTERNA: cliente atrasa sempre", internal: true, createdAt: DIA, authorUser: { name: "Equipe" }, authorPortal: null, attachments: [] },
  ],
}));

async function chamar(nome: string, args: Record<string, unknown> = {}, ctx: { tenantId: string; userId: string | null; escopo: Record<string, string> } = DO_PORTAL) {
  return FERRAMENTAS_DO_PORTAL[nome]!.executar!(args, ctx);
}

/** Os pedidos de cada ferramenta de lista, sem a empresa. */
const LISTAS: [string, Record<string, unknown>][] = [
  ["portal_pendencias", { recorte: "andamento" }],
  ["portal_contas", { tipo: "PAGAR", situacao: "todas" }],
  ["portal_contas", { tipo: "RECEBER", situacao: "abertas" }],
  ["portal_notas", { competencia: "", busca: "" }],
  ["portal_processos", { recorte: "abertos" }],
  ["portal_solicitacoes", { recorte: "aguardando" }],
];

/** As de detalhe, com o prefixo do id das linhas do banco de teste. */
const DETALHES: [string, string][] = [
  ["portal_pendencia", "pendencia"],
  ["portal_processo", "processo"],
  ["portal_solicitacao", "solicitacao"],
];

beforeEach(() => {
  m.banco = bancoDeDoisClientes({ serviceRequest });
  m.modulos = new Set(TODOS_OS_MODULOS);
  m.bloqueadas = new Set();
});

describe("só a Ceci do portal tem as ferramentas do portal, e ela só tem estas", () => {
  const nomes = Object.keys(FERRAMENTAS_DO_PORTAL);

  it("toda ferramenta daqui tem o prefixo e é de leitura — menos a que prepara a solicitação, que nem executa", () => {
    for (const [nome, f] of Object.entries(FERRAMENTAS_DO_PORTAL)) {
      expect(nome.startsWith(PREFIXO_DO_PORTAL)).toBe(true);
      expect(f.def.nome).toBe(nome);
      if (nome === SOLICITACAO_PREPARADA) {
        expect(f.def.natureza).toBe("escrita");
        expect(f.executar).toBeUndefined();
        expect(viraProposta(f.def, f.executar)).toBe(true);
      } else {
        expect(f.def.natureza).toBe("leitura");
        expect(f.executar).toBeTypeOf("function");
      }
    }
  });

  it("a ceci_portal tem exatamente as do portal, nasce desligada e não escreve", () => {
    const def = agenteDoCatalogo("ceci_portal")!;
    expect([...def.ferramentas].sort()).toEqual([...nomes].sort());
    expect(def.padraoLigado).toBe(false);
    expect(def.escreve).toBe(false);
  });

  it("nenhum agente da equipe tem ferramenta do portal", () => {
    for (const a of AGENT_CATALOG.filter((x) => x.code !== "ceci_portal")) {
      expect(a.ferramentas.filter((f) => f.startsWith(PREFIXO_DO_PORTAL)), a.code).toEqual([]);
    }
  });
});

describe("abrirPortal — só o acesso do portal entra", () => {
  it("recusa a conversa da equipe, mesmo com um portalUserId no escopo", async () => {
    await expect(abrirPortal({ tenantId: T, userId: "u-equipe", escopo: { portalUserId: "pu-a" } })).rejects.toThrow("só do portal");
    await expect(abrirPortal({ tenantId: T, userId: null, escopo: {} })).rejects.toThrow("só do portal");
  });

  it("lê as empresas e as telas do acesso no banco", async () => {
    const p = await abrirPortal(DO_PORTAL);
    expect([...p.acesso.companyIds].sort()).toEqual(["a-filial", "a-matriz"]);
    expect(p.telas.has("/portal/pagar")).toBe(true);
  });
});

describe("nunca lê empresa de outro cliente", () => {
  it("portal_empresas: só as do acesso", async () => {
    const r = (await chamar("portal_empresas")) as { empresas: { id: string }[] };
    expect(r.empresas.map((e) => e.id).sort()).toEqual(["a-filial", "a-matriz"]);
  });

  it.each(LISTAS)("%s: tudo o que leu e devolveu é do acesso", async (nome, args) => {
    const r = await chamar(nome, { ...args, empresaId: "" });
    soDoAcesso(m.banco!.leituras);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain("B Vizinho");
    expect(texto).not.toContain("U Outro");
  });

  it.each(LISTAS.flatMap(([nome, args]) => ATAQUES.filter(Boolean).map((e) => [nome, args, e] as const)))(
    "%s com a empresa %s de fora: recusa, sem consultar dado",
    async (nome, args, empresaId) => {
      await expect(chamar(nome, { ...args, empresaId: empresaId! })).rejects.toThrow("Empresa não encontrada");
      expect(m.banco!.leituras.filter((l) => !["company", "portalUser", "portalUserCompany"].includes(l.modelo))).toEqual([]);
    }
  );

  it.each(DETALHES)("%s pelo id do vizinho ou de outro escritório: não encontrado", async (nome, prefixo) => {
    for (const id of [`${prefixo}-b-1`, `${prefixo}-u-1`]) await expect(chamar(nome, { id })).rejects.toThrow(/não encontrad/);
    await chamar(nome, { id: `${prefixo}-a-filial` });
    soDoAcesso(m.banco!.leituras);
  });

  it("conta desativada não lê nada", async () => {
    const ctx = { tenantId: T, userId: null, escopo: { portalUserId: "pu-inativo" } };
    expect(await chamar("portal_empresas", {}, ctx)).toEqual({ empresas: [] });
    const r = (await chamar("portal_contas", { tipo: "PAGAR", situacao: "todas", empresaId: "" }, ctx)) as { contas: unknown[] };
    expect(r.contas).toEqual([]);
  });
});

describe("só as empresas com a Ceci ligada pelo escritório", () => {
  it("a filial entra pela matriz ligada", async () => {
    const p = await abrirPortal(DO_PORTAL);
    expect([...p.acesso.companyIds].sort()).toEqual(["a-filial", "a-matriz"]);
  });

  it("com a matriz desligada, só a empresa ligada direto — e a de fora do piloto é 'não encontrada'", async () => {
    const empresas = EMPRESAS.map((e) =>
      e.id === "a-matriz" ? { ...e, ceciNoPortal: false } : e.id === "a-filial" ? { ...e, ceciNoPortal: true, parent: { ...e.parent, ceciNoPortal: false } } : e
    );
    m.banco = bancoDeDoisClientes({ serviceRequest, company: empresas });
    expect(await chamar("portal_empresas")).toEqual({ empresas: [{ id: "a-filial", nome: "A Filial", cnpj: null }] });
    await expect(chamar("portal_contas", { tipo: "PAGAR", situacao: "todas", empresaId: "a-matriz" })).rejects.toThrow("Empresa não encontrada");
    const r = (await chamar("portal_contas", { tipo: "PAGAR", situacao: "todas", empresaId: "" })) as { contas: { empresa: string }[] };
    expect(r.contas.map((c) => c.empresa)).toEqual(["A Filial"]);
  });

  it("nenhuma ligada: a Ceci não lê nada", async () => {
    m.banco = bancoDeDoisClientes({ serviceRequest, company: EMPRESAS.map((e) => ({ ...e, ceciNoPortal: false, parent: e.parent ? { ...e.parent, ceciNoPortal: false } : null })) });
    expect(await chamar("portal_empresas")).toEqual({ empresas: [] });
    const r = (await chamar("portal_solicitacoes", { recorte: "aguardando", empresaId: "" })) as { solicitacoes: unknown[] };
    expect(r.solicitacoes).toEqual([]);
  });
});

describe("só o que o portal mostra", () => {
  it("tela com o módulo desligado: a Ceci não lê", async () => {
    m.modulos.delete("bpo_contas_pagar");
    await expect(chamar("portal_contas", { tipo: "PAGAR", situacao: "todas", empresaId: "" })).rejects.toThrow("não está disponível");
    await expect(chamar("portal_contas", { tipo: "RECEBER", situacao: "todas", empresaId: "" })).resolves.toBeTruthy();
  });

  it("tela bloqueada pelo escritório: a Ceci não lê", async () => {
    m.bloqueadas = new Set(["/portal/documentos", "/portal/processos"]);
    await expect(chamar("portal_notas", { empresaId: "", competencia: "", busca: "" })).rejects.toThrow("não está disponível");
    await expect(chamar("portal_processo", { id: "processo-a-matriz" })).rejects.toThrow("não está disponível");
  });

  it("solicitação: sem a mensagem interna e sem o responsável", async () => {
    const r = await chamar("portal_solicitacao", { id: "solicitacao-a-matriz" });
    const texto = JSON.stringify(r);
    expect(texto).toContain("Já estamos vendo.");
    expect(texto).not.toContain("NOTA INTERNA");
    expect(texto).not.toContain("Fulano");
    expect(texto).not.toMatch(/assignee|responsavel|interna/i);
  });

  it("nota: sem o destino no financeiro (lançada, ignorada) nem a chave interna de deduplicação", async () => {
    const r = (await chamar("portal_notas", { empresaId: "a-matriz", competencia: "", busca: "" })) as { notas: Record<string, unknown>[] };
    expect(r.notas).toHaveLength(1);
    expect(r.notas[0]!.empresa).toBe(empresa("a-matriz").name);
    expect(JSON.stringify(r)).not.toMatch(/PENDENTE|destin(o|ation)|dedup/i);
  });

  it("os links levam ao portal, nunca à tela da equipe", async () => {
    for (const [nome, args] of LISTAS) {
      const texto = JSON.stringify(await chamar(nome, { ...args, empresaId: "" }));
      for (const caminho of texto.match(/\]\((\/[^)]*)\)/g) ?? []) expect(caminho.startsWith("](/portal")).toBe(true);
    }
  });
});
