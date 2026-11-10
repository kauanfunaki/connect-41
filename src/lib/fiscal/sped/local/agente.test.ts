import { describe, expect, it } from "vitest";
import { agenteDoSinal, ehSlugDoAgenteSped, type MaquinaDoOrquestrador } from "./agente";

const AGORA = new Date("2026-11-10T12:00:00Z");
const minutosAtras = (m: number) => new Date(AGORA.getTime() - m * 60_000);
const maquina = (slug: string, sinal: Date | null, extra: Partial<MaquinaDoOrquestrador> = {}): MaquinaDoOrquestrador => ({ slug, name: `Máquina ${slug}`, isActive: true, lastHeartbeatAt: sinal, ...extra });

describe("o slug do agente do SPED", () => {
  it("aceita hífen ou sublinhado, com ou sem sufixo", () => {
    expect(ehSlugDoAgenteSped("agente_sped")).toBe(true);
    expect(ehSlugDoAgenteSped("agente-sped")).toBe(true);
    expect(ehSlugDoAgenteSped("agente-sped-2")).toBe(true);
    expect(ehSlugDoAgenteSped("agente_spedx")).toBe(false);
    expect(ehSlugDoAgenteSped("robo-societario")).toBe(false);
  });
});

describe("a máquina do sinal", () => {
  it("antes da primeira geração, é a automação do agente: ligada com sinal recente", () => {
    const a = agenteDoSinal(null, [maquina("robo-societario", minutosAtras(1)), maquina("agente_sped", minutosAtras(2))], AGORA);
    expect(a).toEqual({ nome: "Máquina agente_sped", ultimoSinal: minutosAtras(2).toISOString(), semSinal: false });
  });

  it("antes da primeira geração, sem sinal há mais que o prazo: sem sinal, com o último sinal", () => {
    const a = agenteDoSinal(null, [maquina("agente-sped", minutosAtras(60))], AGORA);
    expect(a).toMatchObject({ semSinal: true, ultimoSinal: minutosAtras(60).toISOString() });
    expect(agenteDoSinal(null, [maquina("agente-sped", null)], AGORA)).toMatchObject({ semSinal: true, ultimoSinal: null });
  });

  it("com duas máquinas do agente, vale a de sinal mais recente; desativada não conta", () => {
    const a = agenteDoSinal(null, [maquina("agente-sped", minutosAtras(30)), maquina("agente-sped-2", minutosAtras(1)), maquina("agente_sped_3", minutosAtras(0), { isActive: false })], AGORA);
    expect(a?.nome).toBe("Máquina agente-sped-2");
  });

  it("depois da primeira geração, vale a máquina que pegou, mesmo com outro slug", () => {
    const a = agenteDoSinal("servidor-fiscal", [maquina("agente_sped", minutosAtras(1)), maquina("servidor-fiscal", minutosAtras(40))], AGORA);
    expect(a).toMatchObject({ nome: "Máquina servidor-fiscal", semSinal: true });
  });

  it("a máquina que pegou e foi apagada cai na automação do agente", () => {
    expect(agenteDoSinal("apagada", [maquina("agente_sped", minutosAtras(1))], AGORA)?.nome).toBe("Máquina agente_sped");
  });

  it("sem automação do agente nem tarefa pega, não há sinal", () => {
    expect(agenteDoSinal(null, [maquina("robo-societario", minutosAtras(1))], AGORA)).toBeNull();
    expect(agenteDoSinal(null, [], AGORA)).toBeNull();
  });
});
