import { beforeEach, describe, expect, it, vi } from "vitest";

// O número do endereço curto na criação (10/11/2026, pedido do Kauan): sai do
// contador da tela no escritório (`short_address_counters`), com a linha
// travada até o fim da transação — e nunca é reaproveitado, nem quando o
// registro de maior número é excluído. A unique (tenantId, number) fica de rede.
//
// O banco de mentira imita o que importa do MySQL: a linha do contador
// (`… FOR UPDATE`) só passa para a próxima transação quando a da frente
// termina, a criação da linha que falta parte do maior número da tabela, e a
// unique recusa o número repetido.

type Linha = { tenantId: string; number: number; cnpj?: string };
const banco = vi.hoisted(() => ({
  linhas: [] as { tenantId: string; number: number; cnpj?: string }[],
  contadores: new Map<string, number>(),
  // A fila da trava, por linha do contador: cada transação espera a da frente soltar.
  filas: new Map<string, Promise<void>>(),
  // Para o teste "sem a trava": a leitura do contador não espera ninguém.
  semTrava: false,
}));

function erroDoPrisma(code: string, message: string) {
  return Object.assign(new Error(message), { code, meta: {} });
}

type Sql = { sql: string; values: unknown[] };
function criarTx() {
  const minhas = new Map<string, () => void>();
  const tx = {
    async $queryRaw(consulta: Sql) {
      if (!/FROM short_address_counters/.test(consulta.sql)) throw new Error(`consulta inesperada: ${consulta.sql}`);
      const [tenantId, tela] = consulta.values as string[];
      const chave = `${tenantId}:${tela}`;
      if (!banco.semTrava && !minhas.has(chave)) {
        const frente = banco.filas.get(chave) ?? Promise.resolve();
        let liberar!: () => void;
        const minha = new Promise<void>((r) => (liberar = r));
        banco.filas.set(chave, frente.then(() => minha));
        minhas.set(chave, liberar);
        await frente;
      }
      const ultimo = banco.contadores.get(chave);
      return ultimo === undefined ? [] : [{ ultimo: BigInt(ultimo) }];
    },
    async $executeRaw(consulta: Sql) {
      if (/^INSERT INTO short_address_counters/.test(consulta.sql)) {
        const [tenantId, tela] = consulta.values as string[];
        const chave = `${tenantId}:${tela}`;
        if (banco.contadores.has(chave)) return 0;
        const doEscritorio = banco.linhas.filter((l) => l.tenantId === tenantId).map((l) => l.number);
        banco.contadores.set(chave, doEscritorio.length ? Math.max(...doEscritorio) : 0);
        return 1;
      }
      if (/^UPDATE short_address_counters/.test(consulta.sql)) {
        const [quantos, tenantId, tela] = consulta.values as [number, string, string];
        const chave = `${tenantId}:${tela}`;
        banco.contadores.set(chave, banco.contadores.get(chave)! + quantos);
        return 1;
      }
      throw new Error(`comando inesperado: ${consulta.sql}`);
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
    soltar: () => minhas.forEach((liberar) => liberar()),
  };
  return tx;
}

// Transação que falha desfaz o contador, como no banco: a foto dos contadores
// volta ao que era antes dela.
const prisma = {
  async $transaction<T>(fn: (tx: ReturnType<typeof criarTx>) => Promise<T>): Promise<T> {
    const tx = criarTx();
    const antes = new Map(banco.contadores);
    try {
      return await fn(tx);
    } catch (e) {
      for (const [chave, valor] of antes) banco.contadores.set(chave, valor);
      for (const chave of [...banco.contadores.keys()]) if (!antes.has(chave)) banco.contadores.delete(chave);
      throw e;
    } finally {
      tx.soltar();
    }
  },
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));

const { comNovaTentativa, corridaDoNumero, criarComNumero, numerarLeva, numerosEmSequencia, proximoNumero, reservarNumeros } = await import("./enderecoCurtoNumeracao");

beforeEach(() => {
  banco.linhas = [];
  banco.contadores = new Map();
  banco.filas = new Map();
  banco.semTrava = false;
});

type TxFalsa = ReturnType<typeof criarTx>;
const criarEmpresa = (tenantId: string, extra: Partial<Linha> = {}) =>
  criarComNumero("empresa", tenantId, (tx, number) => (tx as unknown as TxFalsa).company.create({ data: { tenantId, number, ...extra } }));

describe("o próximo número", () => {
  it("começa em 1 e segue o contador do escritório", async () => {
    expect((await criarEmpresa("t1")).number).toBe(1);
    expect((await criarEmpresa("t1")).number).toBe(2);
    // Cada escritório tem a sua sequência.
    expect((await criarEmpresa("t2")).number).toBe(1);
    expect(banco.contadores.get("t1:empresa")).toBe(2);
  });

  it("5 criações ao mesmo tempo no mesmo escritório fazem fila e saem com 1 a 5", async () => {
    const criadas = await Promise.all(Array.from({ length: 5 }, () => criarEmpresa("t1")));
    expect(criadas.map((c) => c.number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(banco.contadores.get("t1:empresa")).toBe(5);
  });

  it("o número nunca volta: excluído o de maior número, o próximo é o 6, e não o 5", async () => {
    for (let i = 0; i < 5; i++) await criarEmpresa("t1");
    banco.linhas = banco.linhas.filter((l) => l.number !== 5);
    expect((await criarEmpresa("t1")).number).toBe(6);
  });

  it("sem a linha do contador (escritório que não tinha nenhum na migration), ela nasce do maior número da tabela", async () => {
    banco.linhas.push({ tenantId: "t1", number: 41 }, { tenantId: "t1", number: 7 }, { tenantId: "t2", number: 90 });
    expect((await criarEmpresa("t1")).number).toBe(42);
    expect(banco.contadores.get("t1:empresa")).toBe(42);
    // Escritório sem nenhum registro: começa do 0.
    expect((await criarEmpresa("t3")).number).toBe(1);
  });

  it("o número vem como bigint do MySQL e sai como number", async () => {
    banco.contadores.set("t1:empresa", 41);
    await prisma.$transaction(async (tx) => {
      expect(await proximoNumero(tx as never, "empresa", "t1")).toBe(42);
    });
  });

  it("sem a trava, as duas leriam o mesmo número — a unique recusa e a perdedora refaz", async () => {
    banco.semTrava = true;
    const criadas = await Promise.all([criarEmpresa("t1"), criarEmpresa("t1")]);
    expect(new Set(criadas.map((c) => c.number)).size).toBe(2);
  });
});

describe("a leva de uma vez (importação, demonstração)", () => {
  it("uma leva de 3 reserva 3 números seguidos de uma vez, e a próxima criação vem depois", async () => {
    await criarEmpresa("t1");
    const leva = await prisma.$transaction((tx) => numerarLeva(tx as never, "empresa", "t1", [{ nome: "a" }, { nome: "b" }, { nome: "c" }]));
    expect(leva).toEqual([
      { nome: "a", number: 2 },
      { nome: "b", number: 3 },
      { nome: "c", number: 4 },
    ]);
    expect(banco.contadores.get("t1:empresa")).toBe(4);
    expect((await criarEmpresa("t1")).number).toBe(5);
  });

  it("leva vazia não mexe no contador; quantidade inválida é erro", async () => {
    expect(await prisma.$transaction((tx) => numerarLeva(tx as never, "empresa", "t1", []))).toEqual([]);
    expect(banco.contadores.has("t1:empresa")).toBe(false);
    await expect(prisma.$transaction((tx) => reservarNumeros(tx as never, "empresa", "t1", 0))).rejects.toThrow(/inválida/);
  });

  it("números em sequência a partir do primeiro reservado, sem mexer no resto", () => {
    expect(numerosEmSequencia(7, [{ nome: "a" }, { nome: "b" }])).toEqual([
      { nome: "a", number: 7 },
      { nome: "b", number: 8 },
    ]);
  });

  it("o Controle interno tem o contador dele, a partir dos itens que já existem", async () => {
    banco.linhas.push({ tenantId: "t1", number: 123 });
    await prisma.$transaction(async (tx) => {
      expect(await proximoNumero(tx as never, "controle-interno", "t1")).toBe(124);
    });
    expect(banco.contadores.get("t1:controle-interno")).toBe(124);
    expect(banco.contadores.has("t1:empresa")).toBe(false);
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

  it("o CNPJ repetido sai na primeira, sem refazer, e o número dela volta ao contador com a transação desfeita", async () => {
    await criarEmpresa("t1", { cnpj: "11222333000181" });
    await expect(criarEmpresa("t1", { cnpj: "11222333000181" })).rejects.toMatchObject({ code: "P2002" });
    expect(banco.linhas).toHaveLength(1);
    expect(banco.contadores.get("t1:empresa")).toBe(1);
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
