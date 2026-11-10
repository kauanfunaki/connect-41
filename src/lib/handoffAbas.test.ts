import { describe, expect, it } from "vitest";
import type { HandoffPriority, HandoffSectorStatus } from "@/generated/prisma/enums";
import {
  abasVisiveis,
  digitosDaBusca,
  lerAba,
  quemVeAsTransferencias,
  setoresDaCaixa,
  whereDaAba,
  whereDaBusca,
  whereDosFiltros,
  type AbaDaTransferencia,
  type QuemVeAsTransferencias,
} from "./handoffAbas";

// Um avaliador mínimo do filtro do Prisma, só com o que as abas usam — como o
// de `handoffs.test.ts`. Chave que ele não conhece falha o teste, para o filtro
// não crescer sem o avaliador acompanhar. `every` em relação vazia é verdadeiro,
// como no banco.
type Setor = { sectorCode: string; status: HandoffSectorStatus; assignees: string[] };
type Transferencia = {
  requestedBy: string;
  fromSector: string;
  priority: HandoffPriority;
  subject: string | null;
  entityType: "COMPANY" | "PERSON";
  entityId: string;
  sectors: Setor[];
};
type Filtro = Record<string, unknown>;

function casaValor(valor: string, filtro: unknown): boolean {
  if (typeof filtro === "string") return valor === filtro;
  const f = filtro as { in?: string[]; not?: string; contains?: string };
  const chaves = Object.keys(f);
  if (chaves.some((k) => !["in", "not", "contains"].includes(k))) throw new Error(`operador não suportado: ${chaves.join(",")}`);
  if (f.in !== undefined && !f.in.includes(valor)) return false;
  if (f.not !== undefined && valor === f.not) return false;
  if (f.contains !== undefined && !valor.toLowerCase().includes(f.contains.toLowerCase())) return false;
  return true;
}

function casaSetor(s: Setor, filtro: Filtro): boolean {
  return Object.entries(filtro).every(([chave, valor]) => {
    if (chave === "sectorCode") return casaValor(s.sectorCode, valor);
    if (chave === "status") return casaValor(s.status, valor);
    if (chave === "assignees") {
      const { some, ...resto } = valor as { some?: { userId: unknown } };
      if (Object.keys(resto).length > 0 || !some) throw new Error("filtro de responsável não suportado");
      return s.assignees.some((u) => casaValor(u, some.userId));
    }
    throw new Error(`chave de setor não suportada: ${chave}`);
  });
}

function casa(t: Transferencia, filtro: Filtro): boolean {
  return Object.entries(filtro).every(([chave, valor]) => {
    if (chave === "AND") return (valor as Filtro[]).every((f) => casa(t, f));
    if (chave === "OR") return (valor as Filtro[]).some((f) => casa(t, f));
    if (chave === "sectors") {
      return Object.entries(valor as Filtro).every(([op, sub]) => {
        if (op === "some") return t.sectors.some((s) => casaSetor(s, sub as Filtro));
        if (op === "every") return t.sectors.every((s) => casaSetor(s, sub as Filtro));
        throw new Error(`operador não suportado: ${op}`);
      });
    }
    if (chave === "subject") return t.subject !== null && casaValor(t.subject, valor);
    if (chave === "requestedBy" || chave === "fromSector" || chave === "priority" || chave === "entityType" || chave === "entityId") {
      return casaValor(t[chave], valor);
    }
    throw new Error(`chave não suportada: ${chave}`);
  });
}

const EU = "u-eu";
const OUTRA = "u-outra";

function t(parcial: Partial<Transferencia> & { sectors: Setor[] }): Transferencia {
  return { requestedBy: OUTRA, fromSector: "comercial", priority: "MEDIUM", subject: null, entityType: "COMPANY", entityId: "c1", ...parcial };
}
const setor = (sectorCode: string, status: HandoffSectorStatus, assignees: string[] = []): Setor => ({ sectorCode, status, assignees });

// Um acervo pequeno que cobre os casos de cada aba.
const ACERVO: Record<string, Transferencia> = {
  paraOFiscalNova: t({ sectors: [setor("fiscal", "NEW")] }),
  paraOFiscalResolvendo: t({ sectors: [setor("fiscal", "IN_PROGRESS", [OUTRA]), setor("contabil", "NEW")] }),
  fiscalJaFinalizou: t({ sectors: [setor("fiscal", "DONE"), setor("contabil", "IN_PROGRESS")] }),
  soContabil: t({ sectors: [setor("contabil", "NEW")] }),
  comigoNoContabil: t({ sectors: [setor("contabil", "IN_PROGRESS", [EU])] }),
  comigoJaFinalizado: t({ sectors: [setor("contabil", "DONE", [EU]), setor("dp", "NEW")] }),
  pedidaPorMim: t({ requestedBy: EU, fromSector: "dp", sectors: [setor("contabil", "NEW")] }),
  pedidaPeloFiscal: t({ fromSector: "fiscal", sectors: [setor("dp", "IN_PROGRESS")] }),
  pedidaPorMimFinalizada: t({ requestedBy: EU, sectors: [setor("contabil", "DONE"), setor("dp", "DONE")] }),
  finalizadaDoFiscal: t({ sectors: [setor("fiscal", "DONE")] }),
};

function quaisCasam(aba: AbaDaTransferencia, quem: QuemVeAsTransferencias): string[] {
  const filtro = whereDaAba(aba, quem) as Filtro;
  return Object.entries(ACERVO)
    .filter(([, x]) => casa(x, filtro))
    .map(([nome]) => nome)
    .sort();
}

const DO_FISCAL: QuemVeAsTransferencias = { userId: EU, setores: ["fiscal"], setorAtivo: null, visaoGeral: false };
const DE_DOIS_SETORES: QuemVeAsTransferencias = { userId: EU, setores: ["fiscal", "contabil"], setorAtivo: null, visaoGeral: false };
const ADMIN_EM_TODOS: QuemVeAsTransferencias = { userId: EU, setores: [], setorAtivo: null, visaoGeral: true };

describe("aba Para o meu setor", () => {
  it("é o que chegou para o setor da pessoa e ele ainda não finalizou", () => {
    expect(quaisCasam("setor", DO_FISCAL)).toEqual(["paraOFiscalNova", "paraOFiscalResolvendo"]);
  });

  it("com dois setores e nenhum ativo, olha os dois", () => {
    expect(quaisCasam("setor", DE_DOIS_SETORES)).toEqual(
      ["comigoNoContabil", "fiscalJaFinalizou", "paraOFiscalNova", "paraOFiscalResolvendo", "pedidaPorMim", "soContabil"].sort()
    );
  });

  it("com um setor ativo, olha só ele", () => {
    expect(quaisCasam("setor", { ...DE_DOIS_SETORES, setorAtivo: "fiscal" })).toEqual(["paraOFiscalNova", "paraOFiscalResolvendo"]);
  });

  it("o administrador em Todos os setores vê tudo o que tem setor em aberto", () => {
    expect(setoresDaCaixa(ADMIN_EM_TODOS)).toBeNull();
    expect(quaisCasam("setor", ADMIN_EM_TODOS)).toEqual(
      Object.entries(ACERVO)
        .filter(([, x]) => x.sectors.some((s) => s.status !== "DONE"))
        .map(([n]) => n)
        .sort()
    );
  });

  it("quem não tem setor nenhum não vê nada (e a aba nem aparece)", () => {
    const semSetor = { userId: EU, setores: [], setorAtivo: null, visaoGeral: false };
    expect(quaisCasam("setor", semSetor)).toEqual([]);
    expect(abasVisiveis(semSetor)).toEqual(["comigo", "enviadas", "finalizadas"]);
  });
});

describe("aba Comigo", () => {
  it("é onde a pessoa responde por um setor que ainda não finalizou", () => {
    expect(quaisCasam("comigo", DO_FISCAL)).toEqual(["comigoNoContabil"]);
  });

  it("não depende do setor ativo", () => {
    expect(quaisCasam("comigo", { ...DO_FISCAL, setorAtivo: "fiscal" })).toEqual(["comigoNoContabil"]);
  });
});

describe("aba Enviadas", () => {
  it("é o que a pessoa ou o setor dela pediu, com algum setor em aberto", () => {
    expect(quaisCasam("enviadas", DO_FISCAL)).toEqual(["pedidaPeloFiscal", "pedidaPorMim"]);
  });

  it("para o administrador em Todos os setores, só o que ele pediu — não a casa inteira", () => {
    expect(quaisCasam("enviadas", ADMIN_EM_TODOS)).toEqual(["pedidaPorMim"]);
  });

  it("com setor ativo, a origem é o setor ativo", () => {
    expect(quaisCasam("enviadas", { ...DE_DOIS_SETORES, setorAtivo: "contabil" })).toEqual(["pedidaPorMim"]);
  });
});

describe("aba Finalizadas", () => {
  it("é a transferência em que todos os setores finalizaram", () => {
    expect(quaisCasam("finalizadas", DO_FISCAL)).toEqual(["finalizadaDoFiscal", "pedidaPorMimFinalizada"]);
  });
});

describe("as abas juntas", () => {
  it("Para o meu setor, Enviadas e Finalizadas não trazem nada finalizado por todos, e Finalizadas só traz isso", () => {
    for (const quem of [DO_FISCAL, DE_DOIS_SETORES, ADMIN_EM_TODOS]) {
      const finalizadas = new Set(quaisCasam("finalizadas", quem));
      for (const aba of ["setor", "comigo", "enviadas"] as const) {
        expect(quaisCasam(aba, quem).filter((n) => finalizadas.has(n))).toEqual([]);
      }
    }
  });
});

describe("lerAba", () => {
  it("abre em Para o meu setor; aba desconhecida volta ao padrão", () => {
    expect(lerAba(undefined, DO_FISCAL)).toBe("setor");
    expect(lerAba("comigo", DO_FISCAL)).toBe("comigo");
    expect(lerAba("lixo", DO_FISCAL)).toBe("setor");
  });

  it("quem não tem caixa de setor abre em Enviadas, e não chega na aba escondida pela URL", () => {
    const semSetor = { userId: EU, setores: [], setorAtivo: null, visaoGeral: false };
    expect(lerAba(undefined, semSetor)).toBe("enviadas");
    expect(lerAba("setor", semSetor)).toBe("enviadas");
  });
});

describe("quemVeAsTransferencias", () => {
  it("tira do contexto o que as abas usam; READONLY tem visão geral", () => {
    expect(quemVeAsTransferencias({ userId: "u1", sectors: ["dp"], activeSector: "dp", role: "SECTOR_ADMIN" })).toEqual({
      userId: "u1",
      setores: ["dp"],
      setorAtivo: "dp",
      visaoGeral: false,
    });
    expect(quemVeAsTransferencias({ userId: "u1", sectors: [], activeSector: null, role: "READONLY" }).visaoGeral).toBe(true);
  });
});

describe("filtros e busca", () => {
  it("prioridade, setor que recebe e responsável", () => {
    const filtro = { AND: whereDosFiltros({ prioridade: "HIGH", setor: "contabil", responsavel: EU }) };
    const alta = t({ priority: "HIGH", sectors: [setor("contabil", "NEW", [EU])] });
    expect(casa(alta, filtro)).toBe(true);
    expect(casa({ ...alta, priority: "LOW" }, filtro)).toBe(false);
    expect(casa(t({ priority: "HIGH", sectors: [setor("fiscal", "NEW", [EU])] }), filtro)).toBe(false);
    expect(whereDosFiltros({})).toEqual([]);
  });

  it("busca no assunto e nas empresas e pessoas achadas pelo nome ou documento", () => {
    const filtro = whereDaBusca("baixa", { empresas: ["c9"], pessoas: ["p1"] }) as Filtro;
    expect(casa(t({ subject: "Baixa de CNPJ", sectors: [] }), filtro)).toBe(true);
    expect(casa(t({ entityId: "c9", sectors: [] }), filtro)).toBe(true);
    expect(casa(t({ entityType: "PERSON", entityId: "p1", sectors: [] }), filtro)).toBe(true);
    // O id de pessoa não casa como empresa.
    expect(casa(t({ entityType: "COMPANY", entityId: "p1", sectors: [] }), filtro)).toBe(false);
    expect(casa(t({ subject: null, sectors: [] }), whereDaBusca("baixa", { empresas: [], pessoas: [] }) as Filtro)).toBe(false);
  });

  it("dígitos da busca só a partir de 3", () => {
    expect(digitosDaBusca("12.345.678/0001-90")).toBe("12345678000190");
    expect(digitosDaBusca("ab1")).toBeNull();
    expect(digitosDaBusca("Padaria")).toBeNull();
  });
});
