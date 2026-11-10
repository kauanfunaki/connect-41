import { describe, expect, it } from "vitest";
import type { HandoffSectorStatus } from "@/generated/prisma/enums";
import { aggregateHandoffStatus, canReadSectorInstruction, whereDaSituacao } from "./handoffs";

describe("aggregateHandoffStatus", () => {
  it("sem setor nenhum é Nova", () => {
    expect(aggregateHandoffStatus([])).toBe("NEW");
  });

  it("só finaliza quando todos os setores finalizam", () => {
    expect(aggregateHandoffStatus(["DONE", "DONE"])).toBe("DONE");
    expect(aggregateHandoffStatus(["DONE", "NEW"])).toBe("IN_PROGRESS");
  });

  it("todos novos continua Nova", () => {
    expect(aggregateHandoffStatus(["NEW", "NEW"])).toBe("NEW");
  });
});

// Um avaliador mínimo do filtro do Prisma, só com o que `whereDaSituacao` usa:
// AND, e na relação `sectors` o some/every (every em relação vazia é verdadeiro,
// como no banco) com `status` igual ou `{ not }`. Qualquer outra chave falha o
// teste, para o filtro não crescer sem o avaliador acompanhar.
type Transferencia = { sectors: { status: HandoffSectorStatus }[] };
type Filtro = Record<string, unknown>;

function casaSetor(setor: { status: HandoffSectorStatus }, filtro: Filtro): boolean {
  return Object.entries(filtro).every(([chave, valor]) => {
    if (chave !== "status") throw new Error(`chave de setor não suportada: ${chave}`);
    if (typeof valor === "string") return setor.status === valor;
    const { not, ...resto } = valor as { not?: string };
    if (Object.keys(resto).length > 0 || not === undefined) throw new Error("filtro de status não suportado");
    return setor.status !== not;
  });
}

function casa(t: Transferencia, filtro: Filtro): boolean {
  return Object.entries(filtro).every(([chave, valor]) => {
    if (chave === "AND") return (valor as Filtro[]).every((f) => casa(t, f));
    if (chave !== "sectors") throw new Error(`chave não suportada: ${chave}`);
    return Object.entries(valor as Filtro).every(([op, sub]) => {
      if (op === "some") return t.sectors.some((s) => casaSetor(s, sub as Filtro));
      if (op === "every") return t.sectors.every((s) => casaSetor(s, sub as Filtro));
      throw new Error(`operador não suportado: ${op}`);
    });
  });
}

const SITUACOES: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE"];

function combinacoes(ate: number): HandoffSectorStatus[][] {
  const todas: HandoffSectorStatus[][] = [[]];
  let nivel: HandoffSectorStatus[][] = [[]];
  for (let n = 1; n <= ate; n++) {
    nivel = nivel.flatMap((c) => SITUACOES.map((s) => [...c, s]));
    todas.push(...nivel);
  }
  return todas;
}

describe("whereDaSituacao", () => {
  const casos = combinacoes(3);

  it("cobre as 40 combinações de 0 a 3 setores", () => {
    expect(casos).toHaveLength(1 + 3 + 9 + 27);
  });

  it.each(casos.map((c) => [c.join(", ") || "sem setor", c] as const))(
    "%s: casa só a situação de aggregateHandoffStatus",
    (_nome, statuses) => {
      const t: Transferencia = { sectors: statuses.map((status) => ({ status })) };
      const casam = SITUACOES.filter((s) => casa(t, whereDaSituacao(s) as Filtro));
      expect(casam).toEqual([aggregateHandoffStatus(statuses)]);
    }
  );
});

// Regressão do achado de 2026-08-24: quem está no setor Contábil lia a
// instrução escrita para o Fiscal na tela de detalhe da transferência.
describe("canReadSectorInstruction", () => {
  const base = {
    fullAccess: false,
    userId: "u-ana",
    requestedBy: "u-controladoria",
    userSectors: ["contabil"],
    sectorCode: "fiscal",
    isAssignee: false,
  };

  it("nega a instrução de setor de que a pessoa não participa", () => {
    expect(canReadSectorInstruction(base)).toBe(false);
  });

  it("libera a instrução do próprio setor", () => {
    expect(canReadSectorInstruction({ ...base, sectorCode: "contabil" })).toBe(true);
  });

  it("libera para quem abriu a transferência — foi quem escreveu as instruções", () => {
    expect(canReadSectorInstruction({ ...base, userId: "u-controladoria" })).toBe(true);
  });

  it("libera para gerência geral (ADMIN/SUPER_ADMIN/READONLY)", () => {
    expect(canReadSectorInstruction({ ...base, fullAccess: true })).toBe(true);
  });

  it("libera para o responsável designado, mesmo de fora do setor", () => {
    expect(canReadSectorInstruction({ ...base, isAssignee: true })).toBe(true);
  });

  it("pessoa sem setor nenhum não lê instrução de setor algum", () => {
    expect(canReadSectorInstruction({ ...base, userSectors: [] })).toBe(false);
  });

  // Sessão sem usuário não pode cair no ramo do requester por comparação
  // null === null vinda de um requestedBy vazio.
  it("sessão sem usuário não vira o autor da transferência", () => {
    expect(canReadSectorInstruction({ ...base, userId: null, requestedBy: "" })).toBe(false);
  });

  // O subworkspace muda o que se LISTA, não o que se tem direito de LER: a
  // pessoa continua lendo a instrução do setor dela mesmo com outro ativo.
  it("não depende do setor ativo, e sim dos setores da pessoa", () => {
    expect(
      canReadSectorInstruction({ ...base, userSectors: ["contabil", "fiscal"] })
    ).toBe(true);
  });
});
