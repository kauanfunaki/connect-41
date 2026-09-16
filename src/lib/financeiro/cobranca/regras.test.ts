import { describe, expect, it } from "vitest";
import {
  situacaoDeCobranca,
  ultimoDosContatos,
  proximaAcao,
  prioridadeNaFila,
  ordenarFila,
  validarContato,
  validarMotivoDaPerda,
  podeBaixarPorPerda,
  podeReverterPerda,
  statusDeVolta,
  type TituloParaCobranca,
  type TituloParaPerda,
} from "./regras";

const HOJE = "2026-09-16";

const titulo = (t: Partial<TituloParaCobranca> = {}): TituloParaCobranca => ({
  status: "CONFERIDO",
  closeReason: null,
  paidAt: null,
  vencimentoKey: "2026-09-01",
  statusDoAcordo: null,
  ultimoContato: null,
  ...t,
});

describe("situacaoDeCobranca", () => {
  it("vencido sem contato", () => {
    expect(situacaoDeCobranca(titulo(), HOJE)).toBe("VENCIDO_SEM_CONTATO");
  });

  it("vence hoje e a vencer estão em dia", () => {
    expect(situacaoDeCobranca(titulo({ vencimentoKey: HOJE }), HOJE)).toBe("EM_DIA");
    expect(situacaoDeCobranca(titulo({ vencimentoKey: "2026-10-01" }), HOJE)).toBe("EM_DIA");
  });

  it("o último contato decide entre em cobrança, prometeu e contestado", () => {
    const c = (resultado: "SEM_RESPOSTA" | "PROMETEU_PAGAR" | "CONTESTOU" | "NEGOCIANDO") =>
      titulo({ ultimoContato: { resultado, contatoKey: "2026-09-10", proximaAcaoKey: null } });
    expect(situacaoDeCobranca(c("SEM_RESPOSTA"), HOJE)).toBe("EM_COBRANCA");
    expect(situacaoDeCobranca(c("NEGOCIANDO"), HOJE)).toBe("EM_COBRANCA");
    expect(situacaoDeCobranca(c("PROMETEU_PAGAR"), HOJE)).toBe("PROMETEU_PAGAR");
    expect(situacaoDeCobranca(c("CONTESTOU"), HOJE)).toBe("CONTESTADO");
  });

  it("perda ganha de tudo, renegociado é em acordo", () => {
    expect(situacaoDeCobranca(titulo({ status: "CANCELADO", closeReason: "PERDA" }), HOJE)).toBe("PERDA");
    expect(situacaoDeCobranca(titulo({ status: "CANCELADO", closeReason: "RENEGOCIADO" }), HOJE)).toBe("EM_ACORDO");
  });

  it("pago e cancelado comum saem da cobrança — inclusive o cancelado antigo, de motivo nulo", () => {
    expect(situacaoDeCobranca(titulo({ status: "PAGO", paidAt: new Date() }), HOJE)).toBeNull();
    expect(situacaoDeCobranca(titulo({ status: "CANCELADO", closeReason: null }), HOJE)).toBeNull();
    expect(situacaoDeCobranca(titulo({ status: "CANCELADO", closeReason: "CANCELADO" }), HOJE)).toBeNull();
  });

  it("parcela de acordo ativo é em acordo mesmo vencida; de acordo quebrado volta à cobrança comum", () => {
    expect(situacaoDeCobranca(titulo({ statusDoAcordo: "ATIVO" }), HOJE)).toBe("EM_ACORDO");
    expect(situacaoDeCobranca(titulo({ statusDoAcordo: "QUEBRADO" }), HOJE)).toBe("VENCIDO_SEM_CONTATO");
  });
});

describe("ultimoDosContatos", () => {
  it("a data do contato manda; no mesmo dia, o registrado por último", () => {
    const d = (s: string) => new Date(s);
    const contatos = [
      { id: "a", contactedAt: d("2026-09-10T15:00:00Z"), createdAt: d("2026-09-10T15:00:00Z") },
      // Retroativo registrado depois: não passa na frente.
      { id: "b", contactedAt: d("2026-09-08T15:00:00Z"), createdAt: d("2026-09-15T15:00:00Z") },
      { id: "c", contactedAt: d("2026-09-10T15:00:00Z"), createdAt: d("2026-09-11T15:00:00Z") },
    ];
    expect(ultimoDosContatos(contatos)?.id).toBe("c");
    expect(ultimoDosContatos([])).toBeNull();
  });
});

describe("próxima ação e fila", () => {
  it("só existe próxima ação agendada; hoje ou atrasada é para hoje", () => {
    const agendada = (k: string) => titulo({ ultimoContato: { resultado: "SEM_RESPOSTA", contatoKey: "2026-09-10", proximaAcaoKey: k } });
    expect(proximaAcao(agendada(HOJE), "EM_COBRANCA", HOJE)).toEqual({ quandoKey: HOJE, paraHoje: true });
    expect(proximaAcao(agendada("2026-09-12"), "EM_COBRANCA", HOJE).paraHoje).toBe(true);
    expect(proximaAcao(agendada("2026-09-20"), "EM_COBRANCA", HOJE).paraHoje).toBe(false);
    expect(proximaAcao(titulo(), "VENCIDO_SEM_CONTATO", HOJE)).toEqual({ quandoKey: null, paraHoje: false });
    expect(proximaAcao(agendada(HOJE), "PERDA", HOJE).quandoKey).toBeNull();
  });

  it("prioridade: combinado para hoje, sem contato, solto, agendado, contestado, acordo, em dia", () => {
    const hoje = { quandoKey: HOJE, paraHoje: true };
    const futura = { quandoKey: "2026-09-30", paraHoje: false };
    const nenhuma = { quandoKey: null, paraHoje: false };
    const p = [
      prioridadeNaFila("CONTESTADO", hoje),
      prioridadeNaFila("VENCIDO_SEM_CONTATO", nenhuma),
      prioridadeNaFila("EM_COBRANCA", nenhuma),
      prioridadeNaFila("PROMETEU_PAGAR", futura),
      prioridadeNaFila("CONTESTADO", nenhuma),
      prioridadeNaFila("EM_ACORDO", nenhuma),
      prioridadeNaFila("EM_DIA", nenhuma),
    ];
    expect(p).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("empate de prioridade: mais atrasado, depois maior valor", () => {
    const fila = ordenarFila([
      { id: "a", prioridade: 1, diasDeAtraso: 5, valorCentavos: 900 },
      { id: "b", prioridade: 1, diasDeAtraso: 20, valorCentavos: 100 },
      { id: "c", prioridade: 0, diasDeAtraso: 1, valorCentavos: 1 },
      { id: "d", prioridade: 1, diasDeAtraso: 5, valorCentavos: 5000 },
    ]);
    expect(fila.map((l) => l.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("validarContato", () => {
  const base = { canal: "TELEFONE", resultado: "SEM_RESPOSTA", contatoEm: HOJE };

  it("aceita contato retroativo e normaliza a anotação", () => {
    const v = validarContato({ ...base, contatoEm: "2026-09-01", notas: "  ligou  " }, HOJE);
    expect(v).toEqual({
      ok: true,
      dados: { canal: "TELEFONE", resultado: "SEM_RESPOSTA", contatoKey: "2026-09-01", proximaAcaoKey: null, notas: "ligou" },
    });
  });

  it("recusa contato futuro, próxima ação no passado e canal desconhecido", () => {
    expect(validarContato({ ...base, contatoEm: "2026-09-17" }, HOJE).ok).toBe(false);
    expect(validarContato({ ...base, proximaAcao: "2026-09-15" }, HOJE).ok).toBe(false);
    expect(validarContato({ ...base, canal: "POMBO" }, HOJE).ok).toBe(false);
    expect(validarContato({ ...base, contatoEm: "2026-02-31" }, HOJE).ok).toBe(false);
  });

  it("prometeu pagar exige a data prometida", () => {
    expect(validarContato({ ...base, resultado: "PROMETEU_PAGAR" }, HOJE).ok).toBe(false);
    expect(validarContato({ ...base, resultado: "PROMETEU_PAGAR", proximaAcao: "2026-09-20" }, HOJE).ok).toBe(true);
  });
});

describe("perda", () => {
  const t = (x: Partial<TituloParaPerda> = {}): TituloParaPerda => ({
    kind: "RECEBER",
    status: "CONFERIDO",
    closeReason: null,
    paidAt: null,
    vencimentoKey: "2026-08-01",
    statusDoAcordo: null,
    ...x,
  });

  it("título a receber vencido e em aberto pode", () => {
    expect(podeBaixarPorPerda(t(), HOJE)).toEqual({ pode: true });
    expect(podeBaixarPorPerda(t({ statusDoAcordo: "QUEBRADO" }), HOJE)).toEqual({ pode: true });
  });

  it("recusa a pagar, não vencido, pago, renegociado, já perdido e parcela de acordo ativo", () => {
    expect(podeBaixarPorPerda(t({ kind: "PAGAR" }), HOJE).pode).toBe(false);
    expect(podeBaixarPorPerda(t({ vencimentoKey: HOJE }), HOJE).pode).toBe(false);
    expect(podeBaixarPorPerda(t({ status: "PAGO", paidAt: new Date() }), HOJE).pode).toBe(false);
    expect(podeBaixarPorPerda(t({ status: "CANCELADO", closeReason: "RENEGOCIADO" }), HOJE).pode).toBe(false);
    expect(podeBaixarPorPerda(t({ status: "CANCELADO", closeReason: "PERDA" }), HOJE).pode).toBe(false);
    expect(podeBaixarPorPerda(t({ statusDoAcordo: "ATIVO" }), HOJE).pode).toBe(false);
  });

  it("motivo obrigatório e reversão só do que é perda", () => {
    expect(validarMotivoDaPerda("  ").ok).toBe(false);
    expect(validarMotivoDaPerda("Empresa falida, sem bens")).toEqual({ ok: true, motivo: "Empresa falida, sem bens" });
    expect(podeReverterPerda({ status: "CANCELADO", closeReason: "PERDA" }).pode).toBe(true);
    expect(podeReverterPerda({ status: "CANCELADO", closeReason: null }).pode).toBe(false);
  });

  it("volta ao status guardado quando é em aberto; senão conferido", () => {
    expect(statusDeVolta("PROVISORIO")).toBe("PROVISORIO");
    expect(statusDeVolta("CONFERIDO")).toBe("CONFERIDO");
    expect(statusDeVolta(null)).toBe("CONFERIDO");
    expect(statusDeVolta("PAGO")).toBe("CONFERIDO");
  });
});
