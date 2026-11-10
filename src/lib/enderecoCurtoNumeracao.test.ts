import { beforeEach, describe, expect, it, vi } from "vitest";

// O número do endereço curto na criação (10/11/2026, pedido do Kauan): a trava
// da linha do escritório põe as criações em fila, o último número vem da
// própria leitura com trava, e a unique (tenantId, number) fica de rede.
//
// O banco de mentira imita o que importa do MySQL: a trava do escritório
// (`tenants … FOR UPDATE`) só passa para a próxima transação quando a da
// frente termina, e a unique recusa o número repetido.

type Linha = { tenantId: string; number: number; cnpj?: string };
const banco = vi.hoisted(() => ({
  linhas: [] as { tenantId: string; number: number; cnpj?: string }[],
  // A fila da trava, por escritório: cada transação espera a da frente soltar.
  filas: new Map<string, Promise<void>>(),
  // Para o teste "sem a trava": a leitura do número não espera ninguém.
  semTrava: false,
}));

function erroDoPrisma(code: string, message: string) {
  return Object.assign(new Error(message), { code, meta: {} });
}

function criarTx(soltar: (f: () => void) => void) {
  let minha: Promise<void> | null = null;
  return {
    async $queryRaw(consulta: { sql?: string; strings?: readonly string[]; values?: unknown[] } | TemplateStringsArray, ...valores: unknown[]) {
      const texto = Array.isArray(consulta) ? consulta.join("?") : ((consulta as { sql: string }).sql ?? "");
      const tenantId = (Array.isArray(consulta) ? valores[0] : (consulta as { values: unknown[] }).values[0]) as string;
      if (/FROM tenants/.test(texto)) {
        if (banco.semTrava || minha) return [{ id: tenantId }];
        const frente = banco.filas.get(tenantId) ?? Promise.resolve();
        let liberar!: () => void;
        minha = new Promise<void>((r) => (liberar = r));
        banco.filas.set(tenantId, frente.then(() => minha!));
        soltar(liberar);
        await frente;
        return [{ id: tenantId }];
      }
      // A leitura do último número.
      const doEscritorio = banco.linhas.filter((l) => l.tenantId === tenantId).sort((a, b) => b.number - a.number);
      return doEscritorio.length ? [{ numero: BigInt(doEscritorio[0].number) }] : [];
    },
    company: {
      async create({ data }: { data: Linha }) {
        // Um respiro antes de gravar: dá tempo para a outra criação andar.
        await new Promise((r) => setTimeout(r, 5));
        if (banco.linhas.some((l) => l.tenantId === data.tenantId && l.number === data.number)) {
          throw erroDoPrisma("P2002", "Unique constraint failed on the constraint: `companies_tenantId_number_key`");
        }
        if (data.cnpj && banco.linhas.some((l) => l.tenantId === data.tenantId && l.cnpj === data.cnpj)) {
          throw erroDoPrisma("P2002", "Unique constraint failed on the constraint: `companies_tenantId_cnpj_key`");
        }
        banco.linhas.push(data);
        return data;
      },
    },
  };
}

const prisma = {
  async $transaction<T>(fn: (tx: ReturnType<typeof criarTx>) => Promise<T>): Promise<T> {
    let liberar: (() => void) | null = null;
    const tx = criarTx((f) => (liberar = f));
    try {
      return await fn(tx);
    } finally {
      (liberar as (() => void) | null)?.();
    }
  },
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));

const { comNovaTentativa, corridaDoNumero, criarComNumero, numerosEmSequencia, proximoNumero } = await import("./enderecoCurtoNumeracao");

beforeEach(() => {
  banco.linhas = [];
  banco.filas = new Map();
  banco.semTrava = false;
});

const criarEmpresa = (tenantId: string, extra: Partial<Linha> = {}) =>
  criarComNumero("empresa", tenantId, (tx, number) =>
    (tx as unknown as ReturnType<typeof criarTx>).company.create({ data: { tenantId, number, ...extra } })
  );

describe("o próximo número", () => {
  it("começa em 1 e segue o maior do escritório", async () => {
    expect((await criarEmpresa("t1")).number).toBe(1);
    expect((await criarEmpresa("t1")).number).toBe(2);
    // Cada escritório tem a sua sequência.
    expect((await criarEmpresa("t2")).number).toBe(1);
  });

  it("criações ao mesmo tempo no mesmo escritório fazem fila e saem com números diferentes", async () => {
    const criadas = await Promise.all(Array.from({ length: 5 }, () => criarEmpresa("t1")));
    expect(criadas.map((c) => c.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it("sem a trava, as duas leriam o mesmo número — a unique recusa e a perdedora refaz", async () => {
    banco.semTrava = true;
    const criadas = await Promise.all([criarEmpresa("t1"), criarEmpresa("t1")]);
    expect(criadas.map((c) => c.number).sort()).toEqual([1, 2]);
  });

  it("o número vem como bigint do MySQL e sai como number", async () => {
    banco.linhas.push({ tenantId: "t1", number: 41 });
    await prisma.$transaction(async (tx) => {
      expect(await proximoNumero(tx as never, "empresa", "t1")).toBe(42);
    });
  });
});

describe("a leva de uma vez (importação, demonstração)", () => {
  it("números em sequência a partir do primeiro reservado, sem mexer no resto", () => {
    expect(numerosEmSequencia(7, [{ nome: "a" }, { nome: "b" }, { nome: "c" }])).toEqual([
      { nome: "a", number: 7 },
      { nome: "b", number: 8 },
      { nome: "c", number: 9 },
    ]);
    expect(numerosEmSequencia(1, [])).toEqual([]);
  });
});

describe("nova tentativa", () => {
  it("refaz só a corrida do número ou o impasse de trava", () => {
    expect(corridaDoNumero(erroDoPrisma("P2002", "Unique constraint failed on the constraint: `people_tenantId_number_key`"))).toBe(true);
    expect(corridaDoNumero(erroDoPrisma("P2034", "Transaction failed due to a write conflict or a deadlock"))).toBe(true);
    expect(corridaDoNumero(erroDoPrisma("P2010", "Raw query failed. Code: `1213`. Message: `Deadlock found when trying to get lock`"))).toBe(true);
    // CNPJ ou CPF repetido é erro de quem cadastra: não adianta refazer.
    expect(corridaDoNumero(erroDoPrisma("P2002", "Unique constraint failed on the constraint: `companies_tenantId_cnpj_key`"))).toBe(false);
    expect(corridaDoNumero(new Error("banco fora"))).toBe(false);
    expect(corridaDoNumero(null)).toBe(false);
  });

  it("o CNPJ repetido sai na primeira, sem refazer", async () => {
    await criarEmpresa("t1", { cnpj: "11222333000181" });
    await expect(criarEmpresa("t1", { cnpj: "11222333000181" })).rejects.toMatchObject({ code: "P2002" });
    expect(banco.linhas).toHaveLength(1);
  });

  it("desiste depois de 3 corridas perdidas", async () => {
    const gravar = vi.fn(async () => {
      throw erroDoPrisma("P2034", "deadlock");
    });
    await expect(comNovaTentativa(gravar)).rejects.toMatchObject({ code: "P2034" });
    expect(gravar).toHaveBeenCalledTimes(3);
  });

  it("na segunda tentativa que dá certo, devolve o resultado", async () => {
    const gravar = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(erroDoPrisma("P2002", "Unique constraint failed on the constraint: `pipeline_items_tenantId_number_key`"))
      .mockResolvedValueOnce("ok");
    expect(await comNovaTentativa(gravar)).toBe("ok");
    expect(gravar).toHaveBeenCalledTimes(2);
  });
});
