import { describe, it, expect } from "vitest";
import {
  protocoloValido,
  normalizarProtocolo,
  classificarDesfecho,
  observadorSima,
  ContratoNaoLevantado,
  CONTRATO_PENDENTE,
  SIGLA,
} from "./sima";
import { OBSERVADORES } from "@/lib/societario/observador";

describe("protocolo do SIMA", () => {
  // Formato medido num protocolo real do setor: AFU-26002918.
  it("aceita o formato real", () => {
    expect(protocoloValido("AFU-26002918")).toBe(true);
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

describe("enquanto o contrato da página não for levantado", () => {
  // A recusa é deliberada: devolver "pendente" por não reconhecer o texto
  // deixaria um deferimento passar despercebido, e o setor não saberia que
  // parou de olhar.
  it("classificar recusa em vez de chutar", () => {
    expect(() => classificarDesfecho({ texto: "qualquer coisa" })).toThrow(ContratoNaoLevantado);
  });

  it("o observador recusa depois de validar o número", async () => {
    await expect(observadorSima({ numero: "AFU-26002918", trackingUrl: "x" })).rejects.toThrow(
      ContratoNaoLevantado
    );
  });

  it("número inválido falha antes, com motivo próprio", async () => {
    await expect(observadorSima({ numero: "123", trackingUrl: "x" })).rejects.toThrow(/formato/);
  });

  // Enquanto não registrado, o cron pula o órgão — o setor segue à mão e
  // ninguém recebe informação inventada.
  it("não está registrado em OBSERVADORES", () => {
    expect(OBSERVADORES[SIGLA]).toBeUndefined();
  });

  it("a lista do que falta está no código, não num documento à parte", () => {
    expect(CONTRATO_PENDENTE.length).toBeGreaterThan(0);
    expect(CONTRATO_PENDENTE.join(" ")).toContain("DEFERIDO");
  });
});
