import { beforeEach, describe, expect, it, vi } from "vitest";

// A trava das consultas que a Ceci do portal vai usar (21/10/2026, fase 1).
//
// O que se prova: com o escopo de um acesso do portal, NENHUMA leitura das
// consultas de notas, contas a pagar e a receber, pendências, solicitações e
// processos casa linha de empresa de outro cliente nem de outro escritório —
// nem quando o filtro pede, de propósito, a empresa do vizinho ou o id de um
// registro dele. Os `where` são aplicados a um banco com os dois clientes
// (`bancoDeTeste.ts`), e não só comparados com o esperado.

import { bancoDeTeste, type Leitura } from "./bancoDeTeste";

const T = "escritorio-41";
const OUTRO = "escritorio-outro";
const DIA = new Date("2026-10-10T12:00:00Z");

/** Cliente A (do acesso): matriz e filial. Cliente B: vizinho, mesmo escritório. Outro escritório: u-1. */
const EMPRESAS = [
  { id: "a-matriz", tenantId: T, parentCompanyId: null, status: "ACTIVE", name: "A Matriz", displayName: null, clientGroupId: "g-a" },
  { id: "a-filial", tenantId: T, parentCompanyId: "a-matriz", status: "ACTIVE", name: "A Filial", displayName: null, clientGroupId: "g-a" },
  { id: "b-1", tenantId: T, parentCompanyId: null, status: "ACTIVE", name: "B Vizinho", displayName: null, clientGroupId: "g-b" },
  { id: "u-1", tenantId: OUTRO, parentCompanyId: null, status: "ACTIVE", name: "U Outro", displayName: null, clientGroupId: "g-u" },
];
const DO_ACESSO = ["a-matriz", "a-filial"];

const empresa = (id: string) => {
  const e = EMPRESAS.find((x) => x.id === id)!;
  return { id: e.id, name: e.name, displayName: e.displayName, kind: "PJ", cnpj: null, cpf: null };
};

/** Uma linha por empresa, com os campos que as consultas filtram e leem. */
function linhas(prefixo: string, extra: (companyId: string) => Record<string, unknown>) {
  return EMPRESAS.map((e) => ({ id: `${prefixo}-${e.id}`, tenantId: e.tenantId, companyId: e.id, company: empresa(e.id), ...extra(e.id) }));
}

const financeEntry = linhas("conta", () => ({
  kind: "PAGAR",
  status: "ABERTO",
  amount: "100.00",
  paidPrincipal: "0",
  dueDate: DIA,
  paidAt: null,
  competence: "2026-10",
  description: "Aluguel",
  approvalStatus: "NAO_EXIGIDA",
  counterparty: { name: "Fornecedor" },
  category: null,
}));

const m = vi.hoisted(() => ({ banco: null as ReturnType<typeof bancoDeTeste> | null }));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.banco!.prisma }));

function novoBanco() {
  return bancoDeTeste({
    company: EMPRESAS,
    portalUser: [
      { id: "pu-a", tenantId: T, active: true, clientGroupId: "g-a" },
      { id: "pu-inativo", tenantId: T, active: false, clientGroupId: "g-a" },
    ],
    portalUserCompany: [
      { tenantId: T, portalUserId: "pu-a", companyId: "a-matriz", incluiFiliais: true },
      { tenantId: T, portalUserId: "pu-inativo", companyId: "a-matriz", incluiFiliais: true },
    ],
    fiscalDocument: linhas("nota", () => ({
      removedAtOrigin: false,
      competence: "2026-09",
      type: "NFE",
      destination: "PENDENTE",
      situation: "AUTORIZADA",
      number: "123",
      issuerName: "Emitente",
      recipientName: "Destinatário",
      accessKey: "1".repeat(44),
      dedupKey: "k",
      issuedAt: DIA,
    })),
    financeEntry,
    financeEntryPayment: financeEntry.map((entry) => ({ id: `baixa-${entry.id}`, paidAt: DIA, entry })),
    clientRequest: linhas("pendencia", () => ({
      title: "Extrato de setembro",
      description: "Mande o extrato",
      kind: "DOCUMENTO",
      status: "ABERTA",
      dueDate: DIA,
      updatedAt: DIA,
      createdAt: DIA,
      resolvedAt: null,
      sectorCode: null,
      createdBy: { name: "Equipe" },
      resolvedBy: null,
      financeEntry: null,
      attachments: [],
      messages: [],
      _count: { messages: 0, attachments: 0 },
    })),
    serviceRequest: linhas("solicitacao", () => ({
      number: 7,
      status: "AGUARDANDO_CLIENTE",
      sectorCode: "BPO",
      description: "Dúvida",
      responseDue: DIA,
      firstResponseAt: null,
      lastMessageAt: DIA,
      createdAt: DIA,
      closedAt: null,
      assigneeId: null,
      subject: { label: "Dúvida" },
      assignee: null,
      openedByPortal: { name: "Cliente" },
      closedBy: null,
      attachments: [],
      messages: [],
    })),
    process: linhas("processo", () => ({
      title: null,
      status: "EM_ANDAMENTO",
      statusReason: null,
      startedAt: DIA,
      concludedAt: null,
      type: { name: "Alteração contratual", expectedDaysMin: null, expectedDaysMax: null, variableFlow: false },
      template: { steps: [] },
      steps: [],
      protocols: [],
    })),
    processFee: linhas("taxa", () => ({ processId: "", description: "Taxa", amountCents: 100, dueDate: DIA, paidAt: null })),
  });
}

const { lerEscopoDoAcesso, montarEscopoDoAcesso, naEmpresa, alcanceFiscalDoAcesso, escopoFinanceiroDoAcesso, escopoDePendenciasDoAcesso, escopoDoClienteDoAcesso } =
  await import("./escopoDoAcesso");
const fiscal = await import("@/lib/fiscal/data");
const financeiro = await import("@/lib/financeiro/consultas");
const pendencias = await import("@/lib/financeiro/pendencias/consultas");
const solicitacoes = await import("@/lib/solicitacoes/consultas");
const processos = await import("@/lib/societario/portal-data");

/** De que empresa e escritório é a linha (a baixa é da conta dela). */
function origem(l: Record<string, unknown>): { tenantId: unknown; companyId: unknown } {
  const entry = l.entry as Record<string, unknown> | undefined;
  return entry ? { tenantId: entry.tenantId, companyId: entry.companyId } : { tenantId: l.tenantId, companyId: l.companyId };
}

/** Toda linha que alguma leitura de dados casou é do escritório e das empresas do acesso. */
function soDoAcesso(leituras: Leitura[], permitidas: readonly string[] = DO_ACESSO) {
  const dados = leituras.filter((l) => !["company", "portalUser", "portalUserCompany"].includes(l.modelo));
  expect(dados.length).toBeGreaterThan(0);
  for (const l of dados) {
    if (l.modelo === "$queryRaw") {
      const valores = (l.where as { valores: unknown[] }).valores;
      expect(valores[0]).toBe(T);
      expect(permitidas).toContain(valores[1]);
      continue;
    }
    for (const linha of l.casadas) {
      const o = origem(linha);
      expect(o.tenantId, `${l.modelo}.${l.metodo}`).toBe(T);
      expect(permitidas, `${l.modelo}.${l.metodo}`).toContain(o.companyId);
    }
  }
}

/** Os pedidos que o modelo pode fazer: nenhum, a empresa do vizinho, a de outro escritório, um id inventado. */
const ATAQUES = [undefined, "b-1", "u-1", "inventada"] as const;

beforeEach(() => {
  m.banco = novoBanco();
});

async function escopoDaContaA() {
  const e = await lerEscopoDoAcesso(T, "pu-a");
  m.banco!.leituras.length = 0;
  return e;
}

describe("lerEscopoDoAcesso — a lista vem da regra do portal", () => {
  it("a conta ativa vê a matriz ligada e a filial dela; nunca o vizinho nem outro escritório", async () => {
    const e = await lerEscopoDoAcesso(T, "pu-a");
    expect([...e.companyIds].sort()).toEqual([...DO_ACESSO].sort());
  });

  it("conta desativada não vê nada, mesmo com empresas ligadas", async () => {
    expect((await lerEscopoDoAcesso(T, "pu-inativo")).companyIds).toEqual([]);
  });

  it("a conta pedida em outro escritório não vê nada", async () => {
    expect((await lerEscopoDoAcesso(OUTRO, "pu-a")).companyIds).toEqual([]);
  });
});

describe("naEmpresa — o recorte por empresa nunca alarga", () => {
  const e = montarEscopoDoAcesso(T, "pu-a", DO_ACESSO);

  it("sem empresa, o escopo inteiro; empresa do acesso, só ela", () => {
    expect(naEmpresa(e).companyIds).toEqual(DO_ACESSO);
    expect(naEmpresa(e, "a-filial").companyIds).toEqual(["a-filial"]);
  });

  it("empresa de fora vira nada, não erro nem o escopo inteiro", () => {
    for (const id of ["b-1", "u-1", "inventada"]) expect(naEmpresa(e, id).companyIds).toEqual([]);
  });

  it("as conversões nunca dão null (o 'escritório inteiro' da equipe) e não mexem na lista do acesso", () => {
    const vazio = montarEscopoDoAcesso(T, "pu-x", []);
    expect(escopoFinanceiroDoAcesso(vazio).companyIds).toEqual([]);
    expect(escopoDePendenciasDoAcesso(vazio).companyIds).toEqual([]);
    expect(escopoDoClienteDoAcesso(vazio).companyIds).toEqual([]);
    expect(alcanceFiscalDoAcesso(vazio)).toEqual({ tipo: "EMPRESAS", tenantId: T, companyIds: [] });
    const f = escopoFinanceiroDoAcesso(e);
    f.companyIds.push("b-1");
    expect(e.companyIds).toEqual(DO_ACESSO);
  });
});

describe("notas fiscais", () => {
  it("o filtro de empresa não substitui mais o alcance (o defeito de até 21/10)", () => {
    const w = fiscal.whereDoFiltro({ tipo: "EMPRESAS", tenantId: T, companyIds: DO_ACESSO }, { companyId: "b-1" });
    expect(w.AND).toEqual([{ tenantId: T, companyId: { in: DO_ACESSO } }]);
    expect(w.companyId).toBe("b-1");
  });

  it.each(ATAQUES)("lista, conta e resume só notas do acesso (empresa pedida: %s)", async (pedida) => {
    const e = await escopoDaContaA();
    const alcance = alcanceFiscalDoAcesso(e);
    const { documentos } = await fiscal.listarDocumentos(alcance, { companyId: pedida });
    await fiscal.contarDocumentos(alcance, { companyId: pedida });
    await fiscal.resumoPorDestino(alcance, { companyId: pedida });
    soDoAcesso(m.banco!.leituras);
    if (pedida) expect(documentos).toEqual([]);
    else expect(documentos.map((d) => d.company.id).sort()).toEqual([...DO_ACESSO].sort());
  });

  it("mesmo chamada sem o recorte do escopo, a consulta não devolve a nota do vizinho", async () => {
    const e = await escopoDaContaA();
    const { documentos } = await fiscal.listarDocumentos(alcanceFiscalDoAcesso(e), { companyId: "b-1", busca: "123" });
    expect(documentos).toEqual([]);
  });

  it("a nota do vizinho, pedida pelo id, não existe para o acesso", async () => {
    const e = await escopoDaContaA();
    expect(await fiscal.obterDocumento(alcanceFiscalDoAcesso(e), "nota-b-1")).toBeNull();
    expect(await fiscal.obterDocumento(alcanceFiscalDoAcesso(e), "nota-u-1")).toBeNull();
    expect(await fiscal.obterDocumento(alcanceFiscalDoAcesso(e), "nota-a-filial")).not.toBeNull();
    soDoAcesso(m.banco!.leituras);
  });

  it("as competências só consultam empresas do acesso", async () => {
    const e = await escopoDaContaA();
    await fiscal.competenciasDisponiveis(alcanceFiscalDoAcesso(naEmpresa(e, "b-1")));
    await fiscal.competenciasDisponiveis(alcanceFiscalDoAcesso(e));
    soDoAcesso(m.banco!.leituras);
  });
});

describe("contas a pagar e a receber", () => {
  it.each(ATAQUES)("lista e soma só contas do acesso (empresa pedida: %s)", async (pedida) => {
    const e = naEmpresa(await escopoDaContaA(), pedida);
    const contas = await financeiro.contasDoEscopo(escopoFinanceiroDoAcesso(e), "PAGAR", "2026-10-21");
    await financeiro.totaisDoEscopo(escopoFinanceiroDoAcesso(e), "PAGAR", "2026-10-21");
    await financeiro.titulosEmAberto(escopoFinanceiroDoAcesso(e));
    if (m.banco!.leituras.length > 0) soDoAcesso(m.banco!.leituras);
    expect(contas.map((c) => c.empresaNome).sort()).toEqual(pedida ? [] : ["A Filial", "A Matriz"]);
  });
});

describe("pendências", () => {
  it.each(ATAQUES)("lista só pendências do acesso (empresa pedida: %s)", async (pedida) => {
    const e = await escopoDaContaA();
    const { linhas } = await pendencias.listarPendencias(escopoDePendenciasDoAcesso(e), { recorte: "todas", empresaId: pedida }, DIA);
    soDoAcesso(m.banco!.leituras);
    expect(linhas.map((l) => l.empresaId).sort()).toEqual(pedida ? [] : [...DO_ACESSO].sort());
  });

  it("a pendência do vizinho, pedida pelo id, não existe para o acesso", async () => {
    const e = await escopoDaContaA();
    expect(await pendencias.carregarPendencia(escopoDePendenciasDoAcesso(e), "pendencia-b-1", DIA)).toBeNull();
    expect(await pendencias.carregarPendencia(escopoDePendenciasDoAcesso(e), "pendencia-u-1", DIA)).toBeNull();
    expect(await pendencias.carregarPendencia(escopoDePendenciasDoAcesso(e), "pendencia-a-matriz", DIA)).not.toBeNull();
    soDoAcesso(m.banco!.leituras);
  });
});

describe("solicitações", () => {
  it.each(ATAQUES)("lista só solicitações do acesso (empresa pedida: %s)", async (pedida) => {
    const e = naEmpresa(await escopoDaContaA(), pedida);
    const lista = await solicitacoes.listarDoCliente(escopoDoClienteDoAcesso(e), "aguardando");
    await solicitacoes.solicitacoesAguardandoCliente(escopoDoClienteDoAcesso(e));
    if (m.banco!.leituras.length > 0) soDoAcesso(m.banco!.leituras);
    expect(lista.map((s) => s.empresaNome).sort()).toEqual(pedida ? [] : ["A Filial", "A Matriz"]);
  });

  it("a solicitação do vizinho, pedida pelo id, não existe para o acesso", async () => {
    const e = await escopoDaContaA();
    const quem = { lado: "CLIENTE" as const, escopo: escopoDoClienteDoAcesso(e) };
    expect(await solicitacoes.carregarSolicitacao(quem, "solicitacao-b-1", DIA)).toBeNull();
    expect(await solicitacoes.carregarSolicitacao(quem, "solicitacao-u-1", DIA)).toBeNull();
    expect(await solicitacoes.carregarSolicitacao(quem, "solicitacao-a-filial", DIA)).not.toBeNull();
    soDoAcesso(m.banco!.leituras);
  });
});

describe("processos", () => {
  it.each(ATAQUES)("lista só processos do acesso (empresa pedida: %s)", async (pedida) => {
    const e = escopoDoClienteDoAcesso(naEmpresa(await escopoDaContaA(), pedida));
    const lista = await processos.processosDoPortal(e.tenantId, e.companyIds, DIA, new Set());
    if (m.banco!.leituras.length > 0) soDoAcesso(m.banco!.leituras);
    expect(lista.map((p) => p.empresaNome).sort()).toEqual(pedida ? [] : ["A Filial", "A Matriz"]);
  });

  it("o processo do vizinho, pedido pelo id, não existe para o acesso", async () => {
    const e = escopoDoClienteDoAcesso(await escopoDaContaA());
    expect(await processos.processoDoPortal(e.tenantId, e.companyIds, "processo-b-1", DIA, new Set())).toBeNull();
    expect(await processos.processoDoPortal(e.tenantId, e.companyIds, "processo-u-1", DIA, new Set())).toBeNull();
    expect(await processos.processoDoPortal(e.tenantId, e.companyIds, "processo-a-matriz", DIA, new Set())).not.toBeNull();
    soDoAcesso(m.banco!.leituras);
  });
});
