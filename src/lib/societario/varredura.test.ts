import { describe, expect, it } from "vitest";
import { lerAvaliacao, prioridadeDepois, sinaisDaVarredura, type Sinal } from "./varredura";

const AGORA = new Date("2026-09-29T12:00:00Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 86_400_000);
const diasAFrente = (n: number) => new Date(AGORA.getTime() + n * 86_400_000);

const vazio = { processos: [], exigencias: [], licencas: [] };

describe("o que a varredura acha", () => {
  it("exigência vencida entra como alta; vencendo hoje não entra", () => {
    const s = sinaisDaVarredura(
      {
        ...vazio,
        exigencias: [
          { id: "e1", descricao: "Falta assinatura", dueAt: diasAtras(5), processo: { id: "p1", nome: "Alteração — BLD" } },
          { id: "e2", descricao: "Hoje", dueAt: AGORA, processo: { id: "p2", nome: "Abertura — X" } },
        ],
      },
      AGORA
    );
    expect(s.map((x) => x.chave)).toEqual(["exig:e1"]);
    expect(s[0]).toMatchObject({ tipo: "EXIGENCIA_VENCIDA", processoId: "p1", dias: 5, urgenciaBase: "ALTA" });
  });

  it("processo parado: 10 dias com trabalho, 30 esperando o órgão", () => {
    const s = sinaisDaVarredura(
      {
        ...vazio,
        processos: [
          { id: "a", nome: "A", status: "EM_ANDAMENTO", dueAt: null, ultimaMovimentacao: diasAtras(10) },
          { id: "b", nome: "B", status: "EM_ANDAMENTO", dueAt: null, ultimaMovimentacao: diasAtras(9) },
          { id: "c", nome: "C", status: "AGUARDANDO_ORGAO", dueAt: null, ultimaMovimentacao: diasAtras(20) },
          { id: "d", nome: "D", status: "AGUARDANDO_ORGAO", dueAt: null, ultimaMovimentacao: diasAtras(31) },
        ],
      },
      AGORA
    );
    expect(s.map((x) => x.chave).sort()).toEqual(["parado:a", "parado:d"]);
  });

  it("processo esperando o cliente, suspenso ou encerrado não é pendência", () => {
    const s = sinaisDaVarredura(
      {
        ...vazio,
        processos: ["AGUARDANDO_CLIENTE", "SUSPENSO", "CONCLUIDO", "CANCELADO", "INDEFERIDO"].map((status, i) => ({
          id: `p${i}`,
          nome: "X",
          status,
          dueAt: diasAtras(20),
          ultimaMovimentacao: diasAtras(90),
        })),
      },
      AGORA
    );
    expect(s).toEqual([]);
  });

  it("prazo combinado vencido vira alta a partir de 7 dias", () => {
    const s = sinaisDaVarredura(
      {
        ...vazio,
        processos: [
          { id: "a", nome: "A", status: "EM_ANDAMENTO", dueAt: diasAtras(2), ultimaMovimentacao: AGORA },
          { id: "b", nome: "B", status: "EM_ANDAMENTO", dueAt: diasAtras(8), ultimaMovimentacao: AGORA },
        ],
      },
      AGORA
    );
    expect(s.find((x) => x.chave === "prazo:a")?.urgenciaBase).toBe("MEDIA");
    expect(s.find((x) => x.chave === "prazo:b")?.urgenciaBase).toBe("ALTA");
  });

  it("licença: vencida, vencendo em 30 dias, e longe demais para avisar", () => {
    const s = sinaisDaVarredura(
      {
        ...vazio,
        licencas: [
          { id: "l1", tipo: "Alvará", empresa: "A", expiresAt: diasAtras(3) },
          { id: "l2", tipo: "Sanitária", empresa: "B", expiresAt: diasAFrente(20) },
          { id: "l3", tipo: "Bombeiros", empresa: "C", expiresAt: diasAFrente(45) },
        ],
      },
      AGORA
    );
    expect(s.map((x) => [x.chave, x.tipo])).toEqual([
      ["lic:l1", "LICENCA_VENCIDA"],
      ["lic:l2", "LICENCA_VENCENDO"],
    ]);
  });
});

describe("a resposta da IA", () => {
  const sinais: Sinal[] = [
    { chave: "exig:e1", tipo: "EXIGENCIA_VENCIDA", titulo: "A", detalhe: "", processoId: "p1", licencaId: null, dias: 5, urgenciaBase: "ALTA" },
    { chave: "parado:p2", tipo: "PROCESSO_PARADO", titulo: "B", detalhe: "", processoId: "p2", licencaId: null, dias: 12, urgenciaBase: "MEDIA" },
  ];

  it("chave inventada é descartada, chave esquecida volta com a urgência do código", () => {
    const r = lerAvaliacao(
      {
        confianca: "ALTA",
        itens: [
          { chave: "parado:p2", urgencia: "ALTA", recomendacao: "Ligar para o cliente" },
          { chave: "exig:inventada", urgencia: "ALTA", recomendacao: "x" },
        ],
      },
      sinais
    );
    expect(r.itens.map((i) => i.chave).sort()).toEqual(["exig:e1", "parado:p2"]);
    expect(r.itens.find((i) => i.chave === "exig:e1")).toEqual({ chave: "exig:e1", urgencia: "ALTA", recomendacao: "" });
    expect(r.confianca).toBe("ALTA");
  });

  it("resposta quebrada não derruba: vale o que o código achou", () => {
    const r = lerAvaliacao("lixo", sinais);
    expect(r.itens).toHaveLength(2);
    expect(r.confianca).toBe("MEDIA");
  });
});

describe("prioridade depois de aprovar", () => {
  it("sobe até alta e não rebaixa urgente", () => {
    expect(prioridadeDepois("NORMAL")).toBe("ALTA");
    expect(prioridadeDepois("BAIXA")).toBe("ALTA");
    expect(prioridadeDepois("URGENTE")).toBe("URGENTE");
  });
});
