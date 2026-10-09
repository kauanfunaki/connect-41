import { describe, expect, it } from "vitest";
import { prazoDaTarefa } from "./kanbanPrazo";
const agora = new Date("2026-10-08T18:00:00Z");
describe("prazoDaTarefa", () => {
  it("distingue vencido, hoje, próximo e distante", () => {
    expect(prazoDaTarefa("2026-10-07", false, agora).rotulo).toBe("Atrasada");
    expect(prazoDaTarefa("2026-10-08", false, agora).rotulo).toBe("Hoje");
    expect(prazoDaTarefa("2026-10-09", false, agora).rotulo).toBe("Amanhã");
    expect(prazoDaTarefa("2026-10-11", false, agora).rotulo).toBe("Em 3 dias");
    expect(prazoDaTarefa("2026-10-12", false, agora).rotulo).toBe("No prazo");
  });
  it("mantém hoje até o fim do dia em Brasília", () => {
    expect(prazoDaTarefa("2026-10-08T00:00:00Z", false, new Date("2026-10-09T02:59:00Z")).rotulo).toBe("Hoje");
    expect(prazoDaTarefa("2026-10-08", false, new Date("2026-10-09T03:00:00Z")).rotulo).toBe("Atrasada");
  });
  it("não sinaliza atraso de tarefa concluída", () => {
    expect(prazoDaTarefa("2026-10-01", true, agora).rotulo).toBe("Concluída");
  });
});
