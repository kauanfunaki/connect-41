import { describe, it, expect } from "vitest";
import { situacaoParaCandidato, normalizarEmail, emailValido } from "./situacaoDoCandidato";

describe("situacaoParaCandidato", () => {
  it("em andamento mostra a linha do tempo até a etapa atual", () => {
    const s = situacaoParaCandidato({ status: "EM_ANDAMENTO", stage: "ENTREVISTA" });
    expect(s.titulo).toBe("Em andamento — entrevista");
    expect(s.linhaDoTempo?.map((e) => e.estado)).toEqual(["feita", "atual", "futura", "futura"]);
    expect(s.podeDesistir).toBe(true);
  });

  it("reprovado vê texto neutro, sem a etapa em que parou", () => {
    for (const status of ["REPROVADO", "ENCERRADO"] as const) {
      const s = situacaoParaCandidato({ status, stage: "TESTE" });
      expect(s).toEqual({ titulo: "Processo encerrado para esta vaga", tom: "encerrada", linhaDoTempo: null, podeDesistir: false });
    }
  });

  it("desistente, aprovado e contratado não podem desistir", () => {
    expect(situacaoParaCandidato({ status: "DESISTENTE", stage: "TRIAGEM" }).titulo).toBe("Você desistiu desta vaga");
    expect(situacaoParaCandidato({ status: "APROVADO", stage: "PROPOSTA" }).tom).toBe("aprovada");
    expect(situacaoParaCandidato({ status: "EM_ANDAMENTO", stage: "CONTRATADO" }).titulo).toBe("Contratado");
    expect(situacaoParaCandidato({ status: "CONTRATADO", stage: "CONTRATADO" }).podeDesistir).toBe(false);
  });
});

describe("e-mail", () => {
  it("normaliza e valida", () => {
    expect(normalizarEmail("  Fulano@Exemplo.COM ")).toBe("fulano@exemplo.com");
    expect(emailValido("fulano@exemplo.com")).toBe(true);
    expect(emailValido("fulano@")).toBe(false);
  });
});
