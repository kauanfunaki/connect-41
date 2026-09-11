import { describe, it, expect } from "vitest";
import {
  podeSubmeter,
  decidirAposSubmissao,
  precisaDeNumeroAMao,
  executorPara,
  EXECUTORES,
  type EtapaParaSubmeter,
} from "./executor";

const AGORA = new Date("2026-09-11T12:00:00Z");

function etapa(over: Partial<EtapaParaSubmeter> = {}): EtapaParaSubmeter {
  return {
    status: "PENDENTE",
    siglaDoOrgao: "TESTE",
    temProtocoloAberto: false,
    itensPendentes: 0,
    ...over,
  };
}

/** Registra um executor só para o teste, e tira depois. */
function comExecutor(fn: () => void) {
  EXECUTORES.TESTE = async () => ({ ok: true, numeroDoProtocolo: "X" });
  try {
    fn();
  } finally {
    delete EXECUTORES.TESTE;
  }
}

describe("podeSubmeter", () => {
  it("etapa pronta, com órgão automatizado, pode", () => {
    comExecutor(() => {
      expect(podeSubmeter(etapa()).pode).toBe(true);
    });
  });

  it("etapa encerrada não volta pelo robô", () => {
    comExecutor(() => {
      expect(podeSubmeter(etapa({ status: "CONCLUIDA" })).pode).toBe(false);
      expect(podeSubmeter(etapa({ status: "DISPENSADA" })).pode).toBe(false);
    });
  });

  it("etapa interna não protocola em lugar nenhum", () => {
    expect(podeSubmeter(etapa({ siglaDoOrgao: null })).pode).toBe(false);
  });

  // Órgão sem robô não é erro: é o setor seguindo à mão, como sempre fez.
  it("órgão sem executor recusa com motivo que não soa como falha", () => {
    const r = podeSubmeter(etapa({ siglaDoOrgao: "SEM_ROBO" }));
    expect(r.pode).toBe(false);
    if (!r.pode) expect(r.motivo).toContain("à mão");
  });

  // A duplicata é o pior defeito desta peça: dois processos no órgão, taxa
  // paga duas vezes, e alguém do setor ligando para cancelar.
  it("protocolo aberto impede segunda submissão", () => {
    comExecutor(() => {
      const r = podeSubmeter(etapa({ temProtocoloAberto: true }));
      expect(r.pode).toBe(false);
      if (!r.pode) expect(r.motivo).toContain("aguardando desfecho");
    });
  });

  it("checklist incompleto segura, e diz quantos faltam", () => {
    comExecutor(() => {
      const um = podeSubmeter(etapa({ itensPendentes: 1 }));
      expect(um.pode).toBe(false);
      if (!um.pode) expect(um.motivo).toContain("Falta 1");

      const varios = podeSubmeter(etapa({ itensPendentes: 3 }));
      if (!varios.pode) expect(varios.motivo).toContain("Faltam 3");
    });
  });
});

describe("decidirAposSubmissao", () => {
  it("sucesso guarda o número e passa a bola para o observador", () => {
    const d = decidirAposSubmissao(
      { ok: true, numeroDoProtocolo: "  2026/00123  " },
      AGORA
    );
    expect(d.protocolo.number).toBe("2026/00123");
    expect(d.protocolo.checkError).toBeNull();
    // Submetido: agora quem acompanha é o observador.
    expect(d.etapaVoltaParaPendente).toBe(false);
  });

  // A reserva nunca é apagada: devolvê-la ao pool faria o robô reusar a
  // tentativa, e a trilha de quantas vezes tentamos se perderia.
  it("falha registra o erro na reserva, sem apagá-la", () => {
    const d = decidirAposSubmissao(
      { ok: false, motivo: "portal fora do ar", recuperavel: true },
      AGORA
    );
    expect(d.protocolo.checkError).toBe("portal fora do ar");
    expect(d.protocolo.number).toBeNull();
    // Ninguém no órgão está esperando: a etapa volta a ser trabalho de gente.
    expect(d.etapaVoltaParaPendente).toBe(true);
    expect(d.recuperavel).toBe(true);
  });

  // Insistir numa recusa de dado é como um robô inunda um órgão de tentativas
  // idênticas.
  it("recusa de dado não é recuperável", () => {
    const d = decidirAposSubmissao(
      { ok: false, motivo: "CNAE incompatível com o endereço", recuperavel: false },
      AGORA
    );
    expect(d.recuperavel).toBe(false);
  });

  it("erro longo é cortado no limite da coluna", () => {
    const d = decidirAposSubmissao(
      { ok: false, motivo: "x".repeat(900), recuperavel: true },
      AGORA
    );
    expect(d.protocolo.checkError).toHaveLength(500);
  });

  it("toda decisão carimba a hora da verificação", () => {
    expect(decidirAposSubmissao({ ok: true, numeroDoProtocolo: "1" }, AGORA).protocolo.lastCheckedAt).toBe(AGORA);
    expect(
      decidirAposSubmissao({ ok: false, motivo: "x", recuperavel: true }, AGORA).protocolo.lastCheckedAt
    ).toBe(AGORA);
  });
});

describe("precisaDeNumeroAMao", () => {
  // O caso mais perigoso: o órgão recebeu e nós não sabemos o protocolo. Não é
  // falha (tentar de novo duplicaria) nem sucesso (ninguém descobriria o
  // desfecho) — é sucesso que exige gente.
  it("sucesso sem número exige gente", () => {
    expect(precisaDeNumeroAMao({ ok: true, numeroDoProtocolo: "" })).toBe(true);
    expect(precisaDeNumeroAMao({ ok: true, numeroDoProtocolo: "   " })).toBe(true);
  });

  it("sucesso com número não exige nada", () => {
    expect(precisaDeNumeroAMao({ ok: true, numeroDoProtocolo: "2026/1" })).toBe(false);
  });

  it("falha não é esse caso", () => {
    expect(precisaDeNumeroAMao({ ok: false, motivo: "x", recuperavel: true })).toBe(false);
  });
});

describe("registro de executores", () => {
  // Vazio de propósito: escrever um exige o contrato da página do órgão, e a
  // autorização do certificado (11/09) destrava, mas não substitui, isso.
  it("nenhum órgão tem executor ainda", () => {
    expect(Object.keys(EXECUTORES)).toHaveLength(0);
    expect(executorPara("JUCEPAR")).toBeNull();
    expect(executorPara(null)).toBeNull();
  });
});
