import { describe, expect, it } from "vitest";
import type { HandoffSectorStatus } from "@/generated/prisma/enums";
import {
  abertaHa,
  aggregateHandoffStatus,
  assuntoDaTransferencia,
  canReadSectorInstruction,
  HANDOFF_PARADA_DIAS,
  HANDOFF_PRIORITY_TOM,
  HANDOFF_STATUS_LABEL,
  HANDOFF_STATUS_TOM,
  SEM_ASSUNTO,
  setorParado,
  tituloDaTransferencia,
  transferenciaParada,
  whereDaSituacao,
} from "./handoffs";

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

  // "Devolvida" (10/11/2026): a parte devolvida vence as outras — a
  // transferência espera quem pediu responder.
  it("uma parte devolvida deixa a transferência Devolvida, mesmo com as outras finalizadas", () => {
    expect(aggregateHandoffStatus(["RETURNED"])).toBe("RETURNED");
    expect(aggregateHandoffStatus(["DONE", "RETURNED"])).toBe("RETURNED");
    expect(aggregateHandoffStatus(["NEW", "IN_PROGRESS", "RETURNED"])).toBe("RETURNED");
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

const SITUACOES: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE", "RETURNED"];

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

  it("cobre as 85 combinações de 0 a 3 setores, com a devolvida", () => {
    expect(casos).toHaveLength(1 + 4 + 16 + 64);
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

// As regras novas da caixa de entrada (10/11/2026).
describe("prioridade e situação no tom do Selo", () => {
  it("Baixa cinza, Média azul, Alta âmbar, Urgente vermelho — Baixa não é mais verde", () => {
    expect(HANDOFF_PRIORITY_TOM).toEqual({ LOW: "neutro", MEDIUM: "marca", HIGH: "atencao", URGENT: "perigo" });
  });

  it("o sinal do setor: nova âmbar, resolvendo azul, finalizada verde, devolvida vermelha", () => {
    expect(HANDOFF_STATUS_TOM).toEqual({ NEW: "atencao", IN_PROGRESS: "marca", DONE: "sucesso", RETURNED: "perigo" });
    expect(HANDOFF_STATUS_LABEL.RETURNED).toBe("Devolvida");
    // O vermelho não repete o âmbar da "Nova": as duas ficam lado a lado na faixa.
    expect(new Set(Object.values(HANDOFF_STATUS_TOM)).size).toBe(4);
  });
});

describe("transferência parada", () => {
  const agora = new Date("2026-11-10T15:00:00Z");
  const diasAtras = (d: number, minutos = 0) => new Date(agora.getTime() - d * 24 * 60 * 60 * 1000 - minutos * 60_000);

  it("usa o mesmo número do aviso do sino", () => {
    expect(HANDOFF_PARADA_DIAS).toBe(3);
  });

  it("setor sem finalizar há 3 dias ou mais está parado; com menos, não", () => {
    expect(setorParado({ status: "NEW", createdAt: diasAtras(3) }, agora)).toBe(true);
    expect(setorParado({ status: "IN_PROGRESS", createdAt: diasAtras(5) }, agora)).toBe(true);
    expect(setorParado({ status: "NEW", createdAt: diasAtras(2, 23 * 60 + 59) }, agora)).toBe(false);
  });

  it("setor finalizado nunca está parado", () => {
    expect(setorParado({ status: "DONE", createdAt: diasAtras(30) }, agora)).toBe(false);
  });

  it("a parte devolvida espera quem pediu, e não conta como parada no setor", () => {
    expect(setorParado({ status: "RETURNED", createdAt: diasAtras(30) }, agora)).toBe(false);
    expect(transferenciaParada([{ status: "RETURNED", createdAt: diasAtras(30) }], agora)).toBe(false);
  });

  it("basta um setor parado para a transferência estar parada", () => {
    expect(
      transferenciaParada(
        [
          { status: "DONE", createdAt: diasAtras(10) },
          { status: "IN_PROGRESS", createdAt: diasAtras(4) },
        ],
        agora
      )
    ).toBe(true);
    expect(transferenciaParada([{ status: "DONE", createdAt: diasAtras(10) }], agora)).toBe(false);
    expect(transferenciaParada([], agora)).toBe(false);
  });
});

describe("assunto da transferência", () => {
  it("o assunto guardado, sem espaço sobrando", () => {
    expect(assuntoDaTransferencia({ subject: "  Baixa de   CNPJ " })).toBe("Baixa de CNPJ");
  });

  it("as de antes, sem assunto, não inventam um: a lista mostra Sem assunto e o título Transferência", () => {
    expect(assuntoDaTransferencia({ subject: null })).toBeNull();
    expect(assuntoDaTransferencia({ subject: "   " })).toBeNull();
    expect(assuntoDaTransferencia({})).toBeNull();
    expect(SEM_ASSUNTO).toBe("Sem assunto");
    expect(tituloDaTransferencia({ subject: null })).toBe("Transferência");
    expect(tituloDaTransferencia({ subject: "Alteração contratual" })).toBe("Alteração contratual");
  });
});

describe("abertaHa", () => {
  const agora = new Date("2026-11-10T15:00:00Z");
  const antes = (minutos: number) => new Date(agora.getTime() - minutos * 60_000);

  it("minutos, horas e dias, sem o 'há' (que está no cabeçalho)", () => {
    expect(abertaHa(antes(0), agora)).toBe("1 min");
    expect(abertaHa(antes(42), agora)).toBe("42 min");
    expect(abertaHa(antes(5 * 60), agora)).toBe("5 h");
    expect(abertaHa(antes(24 * 60), agora)).toBe("1 dia");
    expect(abertaHa(antes(12 * 24 * 60 + 30), agora)).toBe("12 dias");
  });

  it("data no futuro (relógio adiantado) não fica negativa", () => {
    expect(abertaHa(antes(-10), agora)).toBe("1 min");
  });
});
