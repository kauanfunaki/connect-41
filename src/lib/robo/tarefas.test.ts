import { describe, expect, it } from "vitest";
import {
  PRAZO_DA_EXECUCAO_MS,
  capacidadesConhecidas,
  chaveAberta,
  destinoDaFalha,
  devolucaoSchema,
  execucaoPerdida,
} from "./tarefas";

// A fila do robô do Societário (30/10/2026): o que volta para a fila e o que
// chama uma pessoa. A regra que importa é a do tipo que não se repete — hoje
// não há nenhum, e o teste do alvará cobre o caminho repetível.

describe("destinoDaFalha", () => {
  it("queda de rede volta para a fila enquanto há tentativa", () => {
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 1, recuperavel: true })).toBe("PENDENTE");
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 2, recuperavel: true })).toBe("PENDENTE");
  });

  it("na terceira, chama alguém", () => {
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 3, recuperavel: true })).toBe("PRECISA_DE_GENTE");
  });

  it("o que o órgão mostrou e o robô não decide vai direto para alguém", () => {
    expect(destinoDaFalha({ tipo: "imprimir_alvara", tentativas: 1, recuperavel: false })).toBe("PRECISA_DE_GENTE");
  });
});

describe("execucaoPerdida", () => {
  const agora = new Date("2026-10-30T12:00:00Z");
  it("passa de 15 minutos sem devolver", () => {
    expect(execucaoPerdida(new Date(agora.getTime() - PRAZO_DA_EXECUCAO_MS - 1), agora)).toBe(true);
    expect(execucaoPerdida(new Date(agora.getTime() - 60_000), agora)).toBe(false);
    expect(execucaoPerdida(null, agora)).toBe(false);
  });
});

describe("chaveAberta e capacidades", () => {
  it("uma tarefa aberta por licença, tipo e escritório", () => {
    expect(chaveAberta("t1", "imprimir_alvara", "lic-1")).toBe("t1:imprimir_alvara:lic-1");
  });

  it("a máquina só recebe o que o Connect conhece", () => {
    expect(capacidadesConhecidas(["imprimir_alvara", "observar_protocolo", "imprimir_alvara"])).toEqual(["imprimir_alvara"]);
  });
});

describe("devolucaoSchema", () => {
  it("falha exige motivo e se dá para tentar de novo", () => {
    expect(devolucaoSchema.safeParse({ ok: false, motivo: "site fora do ar", recuperavel: true }).success).toBe(true);
    expect(devolucaoSchema.safeParse({ ok: false, motivo: "" , recuperavel: true }).success).toBe(false);
    expect(devolucaoSchema.safeParse({ ok: false, motivo: "x" }).success).toBe(false);
  });

  it("sucesso leva o resultado", () => {
    expect(devolucaoSchema.safeParse({ ok: true, resultado: { tela: "encontrado" } }).success).toBe(true);
  });
});
