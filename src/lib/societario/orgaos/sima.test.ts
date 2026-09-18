import { describe, it, expect } from "vitest";
import {
  protocoloValido,
  normalizarProtocolo,
  classificarSolicitacao,
  semSolicitacao,
  normalizarSelo,
  observadorSima,
  ContratoNaoLevantado,
  SeloNaoObservado,
  SELOS_DE_EXIGENCIA,
  CONTRATO_PENDENTE,
  SIGLA,
} from "./sima";
import { decidir, OBSERVADORES } from "@/lib/societario/observador";

describe("protocolo do SIMA", () => {
  // Formato medido em protocolos reais do setor: AFU-26002918, CAD-26000013.
  it("aceita o formato real", () => {
    expect(protocoloValido("AFU-26002918")).toBe(true);
    expect(protocoloValido("CAD-26000013")).toBe(true);
  });

  it("aceita minúsculo e espaço em volta — é o que a pessoa digita", () => {
    expect(protocoloValido("  afu-26002918 ")).toBe(true);
    expect(normalizarProtocolo("  afu-26002918 ")).toBe("AFU-26002918");
  });

  // Sem esta guarda o robô bate no órgão, ouve "não encontrado", e registra
  // isso como se o pedido tivesse sido recusado.
  it("recusa o que não tem cara de protocolo", () => {
    expect(protocoloValido("12345")).toBe(false);
    expect(protocoloValido("AFU 26002918")).toBe(false);
    expect(protocoloValido("")).toBe(false);
    expect(protocoloValido(null)).toBe(false);
  });

  it("normalizar não inventa dígito", () => {
    expect(normalizarProtocolo("afu-260")).toBe("AFU-260");
    expect(protocoloValido("AFU-260")).toBe(false);
  });
});

describe("classificarSolicitacao", () => {
  // "Pendente" no SIMA é pendente DO REQUERENTE — o oposto do que a palavra
  // sugere. É a aba onde uma leitura errada custa mais: exigência não vista é
  // prazo correndo contra o cliente.
  it("os dois selos da aba Pendente são exigência", () => {
    for (const selo of SELOS_DE_EXIGENCIA) {
      const r = classificarSolicitacao({ aba: "Pendente", selo });
      expect(r.desfecho).toBe("EXIGENCIA");
      expect(r.detalhe).toBe(selo);
    }
  });

  it("a descrição é a palavra do órgão, não a nossa", () => {
    expect(classificarSolicitacao({ aba: "Pendente", selo: "Aguardando Assinatura" }).detalhe).toBe(
      "Aguardando Assinatura"
    );
  });

  // Nenhum estado dentro de "Em análise" conclui o processo, então a aba
  // sozinha decide — exigir selo conhecido aqui daria erro em todo processo
  // normal, sem proteger nada.
  it("a aba Em análise é pendente, qualquer que seja o selo", () => {
    expect(classificarSolicitacao({ aba: "Em análise", selo: "seja lá o que for" }).desfecho).toBe("PENDENTE");
  });

  it("Finalizado com DEFERIDO conclui", () => {
    expect(classificarSolicitacao({ aba: "Finalizado", selo: "DEFERIDO" }).desfecho).toBe("DEFERIDO");
  });

  it("acento e caixa não mudam o selo", () => {
    expect(classificarSolicitacao({ aba: "Finalizado", selo: " deferido " }).desfecho).toBe("DEFERIDO");
    expect(classificarSolicitacao({ aba: "Pendente", selo: "aguardando envio de documento" }).desfecho).toBe(
      "EXIGENCIA"
    );
    expect(normalizarSelo("Em Análise")).toBe("EM ANALISE");
  });
});

describe("o que o leitor recusa", () => {
  // Este é o caso que não vimos e o mais caro de confundir com deferimento.
  it("Finalizado que não é DEFERIDO falha em vez de concluir", () => {
    expect(() => classificarSolicitacao({ aba: "Finalizado", selo: "INDEFERIDO" })).toThrow(SeloNaoObservado);
    expect(() => classificarSolicitacao({ aba: "Finalizado", selo: "INDEFERIDO" })).toThrow(/INDEFERIDO/);
  });

  it("selo desconhecido na aba Pendente falha em vez de virar pendente", () => {
    expect(() => classificarSolicitacao({ aba: "Pendente", selo: "Aguardando Pagamento" })).toThrow(
      SeloNaoObservado
    );
  });

  // A armadilha que fez a classificação deixar de ser por texto livre: o
  // detalhe de um protocolo DEFERIDO tem abas chamadas "Documentos aguardando
  // assinatura" e "Documentos aguardando envio".
  it("o nome de aba do detalhe não vira exigência, porque a decisão não lê texto livre", () => {
    const detalheDeUmDeferido = {
      aba: "Finalizado" as const,
      selo: "DEFERIDO",
    };
    expect(classificarSolicitacao(detalheDeUmDeferido).desfecho).toBe("DEFERIDO");
  });
});

describe("protocolo fora do login", () => {
  // MA-3: a consulta tem de usar o mesmo certificado que abriu o pedido. Tratar
  // isso como "segue pendente" esconderia certificado errado por semanas.
  it("reconhece a frase do portal, com ou sem acento", () => {
    expect(semSolicitacao("Nenhuma solicitação encontrada")).toBe(true);
    expect(semSolicitacao("  NENHUMA SOLICITACAO ENCONTRADA  ")).toBe(true);
    expect(semSolicitacao("3 solicitações")).toBe(false);
  });
});

describe("a ponte com o observador", () => {
  it("a exigência do SIMA passa por decidir sem ser recusada", () => {
    const leitura = classificarSolicitacao({ aba: "Pendente", selo: "Aguardando Envio de Documento" });
    const d = decidir(
      { id: "1", outcome: "PENDENTE", numero: "AFU-26003257", trackingUrl: "x", siglaDoOrgao: SIGLA },
      leitura
    );
    expect(d).toEqual({ tipo: "exigir", descricao: "Aguardando Envio de Documento" });
  });

  it("o observador recusa a navegação depois de validar o número", async () => {
    await expect(observadorSima({ numero: "AFU-26002918", trackingUrl: "x" })).rejects.toThrow(
      ContratoNaoLevantado
    );
  });

  it("número inválido falha antes, com motivo próprio", async () => {
    await expect(observadorSima({ numero: "123", trackingUrl: "x" })).rejects.toThrow(/formato/);
  });

  // Enquanto a navegação não existir, o cron pula o órgão — o setor segue à mão
  // e ninguém recebe informação inventada.
  it("não está registrado em OBSERVADORES", () => {
    expect(OBSERVADORES[SIGLA]).toBeUndefined();
  });

  it("do que faltava, sobrou o que depende de ver a tela autenticada", () => {
    expect(CONTRATO_PENDENTE).toHaveLength(3);
    expect(CONTRATO_PENDENTE.join(" ")).toContain("URL");
  });
});
