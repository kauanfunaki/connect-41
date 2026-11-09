import { describe, expect, it } from "vitest";
import {
  TIPO_DA_COLUNA,
  colunaDeEntrada,
  descricaoDoCartao,
  destinoDoCartao,
  listasDoSetorPorEspaco,
  movimentoDoCartao,
  tituloDoCartao,
  type ColunaDoQuadro,
} from "./cartao";
import type { StatusDaSolicitacao } from "./regras";

// As colunas do modelo "Solicitações de clientes" (modelosDeEspaco.ts), fora de ordem de propósito.
const MODELO: ColunaDoQuadro[] = [
  { id: "resolvida", order: 3, type: "DONE" },
  { id: "nova", order: 0, type: "NOT_STARTED" },
  { id: "aguardando", order: 2, type: "PENDING" },
  { id: "atendimento", order: 1, type: "IN_PROGRESS" },
];

const TODOS: StatusDaSolicitacao[] = ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE", "CONCLUIDA", "CANCELADA"];

describe("onde o cartão nasce", () => {
  it("na primeira coluna não iniciada", () => {
    expect(colunaDeEntrada(MODELO)?.id).toBe("nova");
    const duasNovas: ColunaDoQuadro[] = [...MODELO, { id: "triagem", order: -1, type: "NOT_STARTED" }];
    expect(colunaDeEntrada(duasNovas)?.id).toBe("triagem");
  });

  it("sem coluna não iniciada, na primeira coluna; sem coluna, em lugar nenhum", () => {
    expect(colunaDeEntrada(MODELO.filter((c) => c.type !== "NOT_STARTED"))?.id).toBe("atendimento");
    expect(colunaDeEntrada([])).toBeNull();
  });
});

describe("a solicitação leva o cartão", () => {
  it("cada status tem o tipo da coluna do modelo", () => {
    expect(TIPO_DA_COLUNA).toEqual({
      ABERTA: "NOT_STARTED",
      EM_ANDAMENTO: "IN_PROGRESS",
      AGUARDANDO_CLIENTE: "PENDING",
      CONCLUIDA: "DONE",
      CANCELADA: "DONE",
    });
  });

  it("vai para a primeira coluna do tipo do status", () => {
    expect(destinoDoCartao(MODELO, "nova", "EM_ANDAMENTO")?.id).toBe("atendimento");
    expect(destinoDoCartao(MODELO, "atendimento", "AGUARDANDO_CLIENTE")?.id).toBe("aguardando");
    expect(destinoDoCartao(MODELO, "aguardando", "CONCLUIDA")?.id).toBe("resolvida");
    expect(destinoDoCartao(MODELO, "nova", "CANCELADA")?.id).toBe("resolvida");
    // O cliente respondeu na concluída: reabre, e o cartão volta ao atendimento.
    expect(destinoDoCartao(MODELO, "resolvida", "EM_ANDAMENTO")?.id).toBe("atendimento");
  });

  it("já numa coluna do tipo certo, fica — mesmo que não seja a primeira", () => {
    const duasEmAndamento: ColunaDoQuadro[] = [...MODELO, { id: "conferencia", order: 4, type: "IN_PROGRESS" }];
    expect(destinoDoCartao(duasEmAndamento, "conferencia", "EM_ANDAMENTO")).toBeNull();
    for (const s of TODOS) {
      const certa = MODELO.find((c) => c.type === TIPO_DA_COLUNA[s])!;
      expect(destinoDoCartao(MODELO, certa.id, s)).toBeNull();
    }
  });

  it("lista sem coluna do tipo: o cartão fica onde está", () => {
    const semAguardando = MODELO.filter((c) => c.type !== "PENDING");
    expect(destinoDoCartao(semAguardando, "atendimento", "AGUARDANDO_CLIENTE")).toBeNull();
  });
});

describe("o cartão movido à mão", () => {
  it("na concluída, conclui a solicitação em aberto", () => {
    for (const status of ["ABERTA", "EM_ANDAMENTO", "AGUARDANDO_CLIENTE"] as const) {
      expect(movimentoDoCartao({ numero: 7, status }, "DONE")).toEqual({ ok: true, concluir: true });
    }
  });

  it("na concluída com a solicitação já encerrada, só move", () => {
    expect(movimentoDoCartao({ numero: 7, status: "CONCLUIDA" }, "DONE")).toEqual({ ok: true, concluir: false });
    expect(movimentoDoCartao({ numero: 7, status: "CANCELADA" }, "DONE")).toEqual({ ok: true, concluir: false });
  });

  it("entre as colunas abertas anda livre enquanto a solicitação está em aberto", () => {
    for (const para of ["NOT_STARTED", "IN_PROGRESS", "PENDING"] as const) {
      expect(movimentoDoCartao({ numero: 7, status: "EM_ANDAMENTO" }, para)).toEqual({ ok: true, concluir: false });
    }
  });

  it("não sai da concluída com a solicitação encerrada — e diz como resolver", () => {
    const r = movimentoDoCartao({ numero: 7, status: "CONCLUIDA" }, "IN_PROGRESS");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe("A Solicitação nº 7 está concluída, e o cartão fica na coluna concluída. Para tirá-lo de lá, reabra a solicitação.");
    const c = movimentoDoCartao({ numero: 8, status: "CANCELADA" }, "NOT_STARTED");
    expect(c.ok === false && c.motivo.startsWith("A Solicitação nº 8 está cancelada")).toBe(true);
  });
});

describe("o texto do cartão", () => {
  it("título com o assunto e a empresa, no limite da coluna", () => {
    expect(tituloDoCartao(" Pedir um documento ", "Empresa Exemplo ")).toBe("Pedir um documento — Empresa Exemplo");
    expect(tituloDoCartao("a".repeat(150), "b".repeat(150))).toHaveLength(200);
  });

  it("descrição com o número e o texto do cliente escapado, em parágrafos", () => {
    const html = descricaoDoCartao(12, "Preciso do contrato <script>alert(1)</script>\r\nurgente & rápido\n\n\nObrigado");
    expect(html).toBe(
      "<p><strong>Solicitação nº 12</strong>, aberta pelo cliente. O que ele escreveu:</p>" +
        "<p>Preciso do contrato &lt;script&gt;alert(1)&lt;/script&gt;<br>urgente &amp; rápido</p>" +
        "<p>Obrigado</p>"
    );
  });
});

describe("as listas que o assunto oferece", () => {
  const listas = [
    { id: "1", setor: "fiscal", espaco: "Atendimento", nome: "Solicitações" },
    { id: "2", setor: "dp", espaco: "Folha", nome: "Admissões" },
    { id: "3", setor: "fiscal", espaco: "Rotina", nome: "Mensal › Apuração" },
    { id: "4", setor: "fiscal", espaco: "Atendimento", nome: "Urgentes" },
  ];

  it("só as do setor, agrupadas por espaço na ordem em que vieram", () => {
    expect(listasDoSetorPorEspaco(listas, "fiscal")).toEqual([
      { espaco: "Atendimento", listas: [listas[0], listas[3]] },
      { espaco: "Rotina", listas: [listas[2]] },
    ]);
    expect(listasDoSetorPorEspaco(listas, "societario")).toEqual([]);
    expect(listasDoSetorPorEspaco(listas, "")).toEqual([]);
  });
});
