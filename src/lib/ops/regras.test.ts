import { describe, expect, it } from "vitest";
import { atividade, caminhoDoEvento, diaEmSaoPaulo, ehIngestaoOps, eventoSchema, filtrosSchema, periodoDoDia, watcherSchema } from "./regras";
import { getModuleDef, getModuleRoute } from "@/lib/module-catalog";
import { linkDaNotificacao } from "@/lib/notificacaoLink";

describe("Ops Center", () => {
  it("é um módulo do Tech com rota própria e ativação explícita", () => {
    expect(getModuleDef("tech_ops_center")).toMatchObject({ sectorCode: "tech", defaultEnabled: false, group: "Operação" });
    expect(getModuleRoute("tech_ops_center")).toBe("/ops");
  });
  it("exige identidade estável do evento e valida resultado e data", () => {
    const base = { watcherSlug: "meu_bot", eventId: "lote-1-arquivo-1-tentativa-1", filename: "nota.xml", status: "ERROR" };
    expect(eventoSchema.safeParse(base).success).toBe(true);
    expect(eventoSchema.safeParse({ ...base, eventId: "" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...base, status: "OK" }).success).toBe(false);
    expect(eventoSchema.safeParse({ ...base, processedAt: "amanhã" }).success).toBe(false);
  });
  it("separa desativação, ausência de sinal e perda de comunicação", () => {
    const agora = Date.parse("2026-10-20T12:00:00Z");
    expect(atividade(null, false, agora)).toBe("Desativado");
    expect(atividade(null, true, agora)).toBe("Sem sinal de atividade");
    expect(atividade("2026-10-20T11:58:00Z", true, agora)).toBe("Em execução");
    expect(atividade("2026-10-20T11:57:00Z", true, agora)).toBe("Sem comunicação");
  });
  it("conta o dia em São Paulo, inclusive na virada UTC", () => {
    expect(diaEmSaoPaulo(new Date("2026-10-20T02:59:59Z"))).toBe("2026-10-19");
    expect(periodoDoDia("2026-10-20")).toEqual({ gte: new Date("2026-10-20T03:00:00Z"), lt: new Date("2026-10-21T03:00:00Z") });
  });
  it("copia o destino renomeado usando a pasta de saída", () => {
    const pastas = { folderInput: "N:\\bot\\ENTRADA", folderOutput: "N:\\bot\\SAIDA" };
    expect(caminhoDoEvento({ filename: "original.xml", filenameRenamed: "novo.xml" }, pastas)).toBe("N:\\bot\\SAIDA\\novo.xml");
    expect(caminhoDoEvento({ filename: "original.xml", filenameRenamed: null }, pastas)).toBe("N:\\bot\\ENTRADA\\original.xml");
    expect(caminhoDoEvento({ filename: "original.xml", filenameRenamed: "\\\\servidor\\pasta\\novo.xml" }, pastas)).toBe("\\\\servidor\\pasta\\novo.xml");
  });
  it("só dispensa sessão nos POSTs exatos de ingestão", () => {
    expect(ehIngestaoOps("POST", "/api/ops/events")).toBe(true);
    expect(ehIngestaoOps("POST", "/api/ops/watchers/meu_bot/heartbeat")).toBe(true);
    expect(ehIngestaoOps("POST", "/api/ops/watchers/pasta-de-rede/arquivos")).toBe(true);
    for (const rota of ["/api/ops", "/api/ops/watchers", "/api/ops/events-extra", "/api/ops/watchers/meu_bot/token", "/api/ops/watchers/meu_bot/instability", "/api/ops/watchers/meu_bot/arquivos/x"]) expect(ehIngestaoOps("POST", rota)).toBe(false);
    expect(ehIngestaoOps("GET", "/api/ops/events")).toBe(false);
  });
  it("aceita o filtro de minhas e trata vazios do cadastro", () => {
    expect(filtrosSchema.parse({ mine: "1" }).mine).toBe("1");
    expect(filtrosSchema.safeParse({ page: "-1" }).success).toBe(false);
    expect(filtrosSchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(watcherSchema.parse({ slug: "teste", name: "Teste", ownerId: "" }).ownerId).toBeNull();
  });
  it("o sino abre os erros da automação", () => {
    expect(linkDaNotificacao({ type: "OPS_AUTOMACAO_ERRO", entityId: "meu_bot" })).toBe("/ops?watcher=meu_bot&status=ERROR");
  });
});
