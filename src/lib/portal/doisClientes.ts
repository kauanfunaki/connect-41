// Os dois clientes dos testes da Ceci do portal (21/10/2026): o cliente A, do
// acesso (matriz e filial ligadas por "incluir filiais"), o vizinho B no mesmo
// escritório, e uma empresa de outro escritório. Uma linha de cada tabela por
// empresa. Usado por `travaDasConsultas.test.ts` (fase 1) e
// `ferramentas-portal.test.ts` (fase 2). Só para testes.

import { expect } from "vitest";
import { bancoDeTeste, type Leitura } from "./bancoDeTeste";

export const T = "escritorio-41";
export const OUTRO = "escritorio-outro";
export const DIA = new Date("2026-10-10T12:00:00Z");

/** Cliente A (do acesso): matriz e filial. Cliente B: vizinho, mesmo escritório. Outro escritório: u-1. */
// Todas com a Ceci ligada (fase 3) — a filial pela matriz —, para o teste
// provar que a trava é o acesso, e não a chave da Ceci.
const MATRIZ_A = { id: "a-matriz", tenantId: T, parentCompanyId: null, parent: null, status: "ACTIVE", name: "A Matriz", displayName: null, clientGroupId: "g-a", ceciNoPortal: true };
export const EMPRESAS = [
  MATRIZ_A,
  { id: "a-filial", tenantId: T, parentCompanyId: "a-matriz", parent: MATRIZ_A, status: "ACTIVE", name: "A Filial", displayName: null, clientGroupId: "g-a", ceciNoPortal: false },
  { id: "b-1", tenantId: T, parentCompanyId: null, parent: null, status: "ACTIVE", name: "B Vizinho", displayName: null, clientGroupId: "g-b", ceciNoPortal: true },
  { id: "u-1", tenantId: OUTRO, parentCompanyId: null, parent: null, status: "ACTIVE", name: "U Outro", displayName: null, clientGroupId: "g-u", ceciNoPortal: true },
];
export const DO_ACESSO = ["a-matriz", "a-filial"];

export const empresa = (id: string) => {
  const e = EMPRESAS.find((x) => x.id === id)!;
  return { id: e.id, name: e.name, displayName: e.displayName, kind: "PJ", cnpj: null, cpf: null };
};

/** Uma linha por empresa, com os campos que as consultas filtram e leem. */
export function linhas(prefixo: string, extra: (companyId: string) => Record<string, unknown>) {
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

/** O banco dos dois clientes; `extra` acrescenta ou troca tabelas. */
export function bancoDeDoisClientes(extra: Record<string, Record<string, unknown>[]> = {}) {
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
    ...extra,
  });
}

/** De que empresa e escritório é a linha (a baixa é da conta dela). */
function origem(l: Record<string, unknown>): { tenantId: unknown; companyId: unknown } {
  const entry = l.entry as Record<string, unknown> | undefined;
  return entry ? { tenantId: entry.tenantId, companyId: entry.companyId } : { tenantId: l.tenantId, companyId: l.companyId };
}

/** Toda linha que alguma leitura de dados casou é do escritório e das empresas do acesso. */
export function soDoAcesso(leituras: Leitura[], permitidas: readonly string[] = DO_ACESSO) {
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
export const ATAQUES = [undefined, "b-1", "u-1", "inventada"] as const;
