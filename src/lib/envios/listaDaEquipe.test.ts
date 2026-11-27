import { beforeEach, describe, expect, it, vi } from "vitest";

// A lista de Envios da equipe, paginada no servidor (27/11/2026,
// melhoria-571): ia até os 500 mais recentes, filtrava a situação em memória e
// contava os cartões só sobre esses 500. Agora a situação é filtro de banco
// (`whereDaSituacaoDoEnvio`), e o teste confere esse filtro contra a regra
// (`situacaoDoEnvio`) em todas as combinações de status, data marcada, aceite
// pedido, abertura e aceite.

const clientDocument = { findMany: vi.fn(), count: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ clientDocument }) }));

const { ENVIOS_POR_PAGINA, listarEnviosDaEquipe, whereDaSituacaoDoEnvio } = await import("./consultas");
const { SITUACOES_DO_ENVIO, situacaoDoEnvio } = await import("./regras");

type Prova = { sentAt: Date | null; firstViewedAt: Date | null; signedAt: Date | null };
type Envio = { status: "DRAFT" | "PUBLISHED"; requiresSignature: boolean; scheduledFor: Date | null; recipients: Prova[] };

/**
 * Lê um `where` do Prisma sobre um envio em memória — só os operadores que o
 * filtro da situação usa: igualdade, `null`, `{ not: null }`, `some`, `none`,
 * `AND` e `OR`. Operador desconhecido falha o teste, em vez de passar calado.
 */
function casa(where: Record<string, unknown>, registro: Record<string, unknown>): boolean {
  return Object.entries(where).every(([chave, cond]) => {
    if (chave === "AND") return (cond as Record<string, unknown>[]).every((w) => casa(w, registro));
    if (chave === "OR") return (cond as Record<string, unknown>[]).some((w) => casa(w, registro));
    const valor = registro[chave];
    if (cond === null) return valor === null;
    if (typeof cond !== "object") return valor === cond;
    const c = cond as Record<string, unknown>;
    if ("some" in c) return (valor as Record<string, unknown>[]).some((r) => casa(c.some as Record<string, unknown>, r));
    if ("none" in c) return !(valor as Record<string, unknown>[]).some((r) => casa(c.none as Record<string, unknown>, r));
    if ("not" in c && c.not === null) return valor !== null;
    throw new Error(`operador não previsto no teste: ${chave} ${JSON.stringify(cond)}`);
  });
}

const DIA = new Date("2026-11-27T12:00:00Z");
const provas = (abriu: boolean, aceitou: boolean, outro: boolean): Prova[] => [
  { sentAt: DIA, firstViewedAt: abriu ? DIA : null, signedAt: aceitou ? DIA : null },
  // Um segundo destinatário que não fez nada: o "alguém" da regra é qualquer um.
  ...(outro ? [{ sentAt: DIA, firstViewedAt: null, signedAt: null }] : []),
];

function todasAsCombinacoes(): Envio[] {
  const lista: Envio[] = [];
  for (const status of ["DRAFT", "PUBLISHED"] as const)
    for (const requiresSignature of [false, true])
      for (const scheduledFor of [null, DIA])
        for (const abriu of [false, true])
          for (const aceitou of [false, true])
            for (const outro of [false, true]) lista.push({ status, requiresSignature, scheduledFor, recipients: provas(abriu, aceitou, outro) });
  // Sem destinatário nenhum.
  for (const status of ["DRAFT", "PUBLISHED"] as const)
    for (const requiresSignature of [false, true]) lista.push({ status, requiresSignature, scheduledFor: null, recipients: [] });
  return lista;
}

describe("whereDaSituacaoDoEnvio — a regra da situação, como filtro de banco", () => {
  it("cada envio casa com o filtro da sua situação, e só com ele", () => {
    for (const envio of todasAsCombinacoes()) {
      const esperada = situacaoDoEnvio(envio);
      const casadas = SITUACOES_DO_ENVIO.map((s) => s.chave).filter((s) => casa(whereDaSituacaoDoEnvio(s) as Record<string, unknown>, envio));
      expect(casadas, JSON.stringify(envio)).toEqual([esperada]);
    }
  });
});

describe("listarEnviosDaEquipe — uma página da lista", () => {
  const ALCANCE = { tenantId: "escritorio-a", empresas: {} };

  beforeEach(() => {
    vi.clearAllMocks();
    clientDocument.findMany.mockResolvedValue([]);
  });

  /** O 1º `count` é o total da lista; os outros quatro, os cartões. */
  function totais(daLista: number, cartoes = 2) {
    clientDocument.count.mockReset();
    clientDocument.count.mockResolvedValue(cartoes);
    clientDocument.count.mockResolvedValueOnce(daLista);
  }

  it("a situação vai para o where da lista, e a página vira skip/take", async () => {
    totais(75);
    const r = await listarEnviosDaEquipe(ALCANCE, { empresaId: "empresa-1", situacao: "enviado" }, 2);
    const pedido = clientDocument.findMany.mock.calls[0]![0];
    expect(pedido.where).toEqual({
      AND: [{ tenantId: "escritorio-a", company: {}, companyId: "empresa-1" }, whereDaSituacaoDoEnvio("enviado")],
    });
    expect(pedido.skip).toBe(ENVIOS_POR_PAGINA);
    expect(pedido.take).toBe(ENVIOS_POR_PAGINA);
    expect(pedido.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(clientDocument.count.mock.calls[0]![0]).toEqual({ where: pedido.where });
    expect(r).toMatchObject({ total: 75, pagina: 2, totalDePaginas: 2 });
  });

  it("os cartões contam a empresa inteira, sem a situação escolhida", async () => {
    totais(10, 4);
    const r = await listarEnviosDaEquipe(ALCANCE, { empresaId: null, situacao: "visto" }, 1);
    const base = { tenantId: "escritorio-a", company: {} };
    expect(clientDocument.count.mock.calls.slice(1).map((c) => c[0])).toEqual(
      (["rascunho", "agendado", "enviado", "aguardando-aceite"] as const).map((s) => ({ where: { AND: [base, whereDaSituacaoDoEnvio(s)] } }))
    );
    expect(r.contadores).toEqual({ rascunhos: 4, agendados: 4, naoVistos: 4, semAceite: 4 });
  });

  it("sem situação, a lista é a da empresa; página além do fim cai na última", async () => {
    totais(3);
    const r = await listarEnviosDaEquipe(ALCANCE, { empresaId: null }, 5);
    expect(clientDocument.findMany.mock.calls[0]![0].where).toEqual({ tenantId: "escritorio-a", company: {} });
    expect(r).toMatchObject({ pagina: 1, totalDePaginas: 1 });
    expect(clientDocument.findMany).toHaveBeenCalledTimes(2);
    expect(clientDocument.findMany.mock.calls[1]![0].skip).toBe(0);
  });
});
