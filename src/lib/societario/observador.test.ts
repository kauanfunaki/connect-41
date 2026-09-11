import { describe, it, expect } from "vitest";
import {
  decidir,
  podeVerificar,
  observadorPara,
  OBSERVADORES,
  type ProtocoloParaVerificar,
} from "./observador";

// Cada recusa testada aqui evita um estrago específico, e o pior deles é o
// primeiro: marcar processo como deferido sem ser.

function protocolo(over: Partial<ProtocoloParaVerificar> = {}): ProtocoloParaVerificar {
  return {
    id: "p1",
    outcome: "PENDENTE",
    numero: "2026/00123",
    trackingUrl: "https://orgao.exemplo/consulta",
    siglaDoOrgao: "JUCEPAR",
    ...over,
  };
}

describe("decidir", () => {
  it("deferido pelo órgão vira deferimento", () => {
    expect(decidir(protocolo(), { desfecho: "DEFERIDO" })).toEqual({ tipo: "deferir" });
  });

  it("pendente no órgão só marca que olhamos", () => {
    expect(decidir(protocolo(), { desfecho: "PENDENTE" })).toEqual({ tipo: "segue_pendente" });
  });

  it("exigência com texto vira exigência", () => {
    const d = decidir(protocolo(), { desfecho: "EXIGENCIA", detalhe: "  Falta assinatura do sócio  " });
    expect(d).toEqual({ tipo: "exigir", descricao: "Falta assinatura do sócio" });
  });

  // Exigência é o que a pessoa vai ler para saber o que corrigir. Uma vazia
  // devolve o processo para a fila sem dizer por quê — pior que não gravar.
  it("exigência sem texto é recusada", () => {
    expect(decidir(protocolo(), { desfecho: "EXIGENCIA" }).tipo).toBe("pular");
    expect(decidir(protocolo(), { desfecho: "EXIGENCIA", detalhe: "   " }).tipo).toBe("pular");
  });

  // Reprocessar criaria exigência duplicada, ou reabriria um deferimento que
  // alguém já usou para seguir o processo.
  it("protocolo já resolvido não é tocado, mesmo que o órgão diga outra coisa", () => {
    expect(decidir(protocolo({ outcome: "DEFERIDO" }), { desfecho: "EXIGENCIA", detalhe: "x" }).tipo).toBe(
      "pular"
    );
    expect(decidir(protocolo({ outcome: "EXIGENCIA" }), { desfecho: "DEFERIDO" }).tipo).toBe("pular");
  });

  it("sem número não há o que consultar — é cedo, não é erro", () => {
    const d = decidir(protocolo({ numero: null }), { desfecho: "DEFERIDO" });
    expect(d.tipo).toBe("pular");
    if (d.tipo === "pular") expect(d.motivo).toContain("sem número");
  });
});

describe("podeVerificar", () => {
  // Hoje o registro está vazio de propósito: escrever um leitor exige o
  // contrato da página do órgão, que não se adivinha.
  it("nenhum órgão tem leitor registrado ainda", () => {
    expect(Object.keys(OBSERVADORES)).toHaveLength(0);
    expect(observadorPara("JUCEPAR")).toBeNull();
    expect(podeVerificar(protocolo())).toBe(false);
  });

  it("com leitor registrado, protocolo completo passa a ser verificável", () => {
    OBSERVADORES.TESTE = async () => ({ desfecho: "PENDENTE" });
    try {
      expect(podeVerificar(protocolo({ siglaDoOrgao: "TESTE" }))).toBe(true);
      // Falta qualquer uma das três peças e ele sai da fila do robô.
      expect(podeVerificar(protocolo({ siglaDoOrgao: "TESTE", numero: null }))).toBe(false);
      expect(podeVerificar(protocolo({ siglaDoOrgao: "TESTE", trackingUrl: null }))).toBe(false);
      expect(podeVerificar(protocolo({ siglaDoOrgao: "TESTE", outcome: "DEFERIDO" }))).toBe(false);
    } finally {
      delete OBSERVADORES.TESTE;
    }
  });

  it("órgão sem sigla nunca casa com leitor", () => {
    expect(observadorPara(null)).toBeNull();
  });
});
