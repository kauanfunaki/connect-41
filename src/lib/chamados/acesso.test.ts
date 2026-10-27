import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { podeAbrir, podeVer, podeVerInterno, podeOperar, podeGerenciar, podeResponder } from "./acesso";

const ctx: AuthContext = { userId: "u", tenantId: "t", homeTenantId: "t", role: "SECTOR_USER", sectors: ["fiscal"], activeSector: "fiscal", subscriptionReadOnly: false, canSelfRegularizeSubscription: false };
const config = { enabled: true, sectorCode: "tech", requesterSectors: ["fiscal"] };
const alvo = { tenantId: "t", createdById: "outro", requesterSectorCode: "fiscal", participants: [], approverIds: [] };
describe("acesso aos chamados", () => {
  it("qualquer usuário do setor liberado abre, mas não vê os chamados dos colegas", () => {
    expect(podeAbrir(ctx, config)).toBe(true); expect(podeVer(ctx, config, alvo)).toBe(false);
    expect(podeAbrir({ ...ctx, sectors: ["contabil"] }, config)).toBe(false);
    expect(podeVer(ctx, config, { ...alvo, createdById: ctx.userId })).toBe(true);
    expect(podeOperar({ ...ctx, role: "ADMIN" }, config)).toBe(false);
  });
  it("administrador acompanha todos os chamados, sem passar a atender", () => {
    expect(podeVer({ ...ctx, role: "ADMIN" }, config, alvo)).toBe(true);
    expect(podeVerInterno({ ...ctx, role: "SUPER_ADMIN" }, config)).toBe(true);
    expect(podeVerInterno(ctx, config)).toBe(false);
  });
  it("participante não vê o chamado e gestor do setor solicitante vê", () => {
    expect(podeVer(ctx, config, { ...alvo, participants: [{ userId: "u" }] })).toBe(false);
    expect(podeVer({ ...ctx, role: "SECTOR_ADMIN" }, config, alvo)).toBe(true);
    expect(podeVerInterno({ ...ctx, role: "SECTOR_ADMIN" }, config)).toBe(false);
  });
  it("aprovador não tem acesso automático ao chamado", () => expect(podeVer(ctx, config, { ...alvo, approverIds: ["u"] })).toBe(false));
  it("transferir o módulo revoga atendimento da equipe antiga, mesmo havendo atribuição", () => {
    const equipe = { ...ctx, sectors: ["tech"] };
    expect(podeOperar(equipe, config)).toBe(true);
    expect(podeOperar(equipe, { ...config, sectorCode: "controladoria" })).toBe(false);
    expect(podeVer(equipe, { ...config, sectorCode: "controladoria" }, alvo)).toBe(false);
  });
  it("remoção de setor bloqueia abertura e preserva o histórico próprio", () => {
    expect(podeAbrir(ctx, { ...config, requesterSectors: [] })).toBe(false);
    expect(podeVer(ctx, { ...config, requesterSectors: [] }, { ...alvo, createdById: "u" })).toBe(true);
  });
  it("setor ativo não amplia nem reduz autorização e papel não substitui tenant", () => {
    expect(podeAbrir({ ...ctx, activeSector: "tech" }, config)).toBe(true);
    expect(podeVer({ ...ctx, role: "ADMIN" }, config, { ...alvo, tenantId: "outro" })).toBe(false);
  });
  it("somente leitura e assinatura travada nunca escrevem", () => {
    for (const c of [{ ...ctx, role: "READONLY" as const }, { ...ctx, subscriptionReadOnly: true }]) {
      expect(podeAbrir(c, config)).toBe(false); expect(podeOperar(c, config)).toBe(false); expect(podeGerenciar(c, config)).toBe(false);
      expect(podeResponder(c, config, { ...alvo, createdById: "u" }, "AGUARDANDO_USUARIO", false)).toBe(false);
    }
    expect(podeVer({ ...ctx, role: "READONLY" }, config, alvo)).toBe(false);
    expect(podeVer({ ...ctx, role: "READONLY" }, config, { ...alvo, createdById: ctx.userId })).toBe(true);
  });
  it("solicitante responde apenas em espera e nunca envia nota interna", () => {
    const meu = { ...alvo, createdById: "u" };
    expect(podeResponder(ctx, config, meu, "AGUARDANDO_USUARIO", false)).toBe(true);
    expect(podeResponder(ctx, config, meu, "EM_ANDAMENTO", false)).toBe(false);
    expect(podeResponder(ctx, config, meu, "AGUARDANDO_USUARIO", true)).toBe(false);
  });
  it("módulo desligado impede leitura, abertura e atendimento", () => {
    const off = { ...config, enabled: false };
    expect(podeVer({ ...ctx, role: "ADMIN" }, off, alvo)).toBe(false); expect(podeAbrir(ctx, off)).toBe(false); expect(podeOperar({ ...ctx, role: "ADMIN" }, off)).toBe(false);
  });
});
