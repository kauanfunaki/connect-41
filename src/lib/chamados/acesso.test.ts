import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import { podeAbrir, podeVer, podeVerInterno, podeVerInternoNo, podeOperar, podeOperarNo, podeGerenciar, podeGerenciarNo, podeRedirecionar, podeResponder, escoposDaBusca, setorQueAtende, setoresQueAtendo } from "./acesso";

const ctx: AuthContext = { userId: "u", tenantId: "t", homeTenantId: "t", role: "SECTOR_USER", sectors: ["fiscal"], activeSector: "fiscal", subscriptionReadOnly: false, canSelfRegularizeSubscription: false };
const config = { enabled: true, sectorCode: "tech", sectorCodes: ["tech"] };
const alvo = { tenantId: "t", createdById: "outro", requesterSectorCode: "fiscal", handlingSectorCode: "tech", participants: [], approverIds: [] };
describe("acesso aos chamados", () => {
  it("qualquer usuário abre, mas não vê os chamados dos colegas", () => {
    expect(podeAbrir(ctx, config)).toBe(true); expect(podeVer(ctx, config, alvo)).toBe(false);
    expect(podeAbrir({ ...ctx, sectors: ["contabil"] }, config)).toBe(true);
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
  it("setor que deixa de administrar para de atender, e o administrador redireciona o que ficou", () => {
    const equipe = { ...ctx, sectors: ["tech"] }, movido = { ...config, sectorCode: "controladoria", sectorCodes: ["controladoria", "rh"] };
    expect(podeOperar(equipe, config)).toBe(true);
    expect(podeOperar(equipe, movido)).toBe(false);
    expect(podeOperarNo(equipe, movido, "tech")).toBe(false);
    expect(podeRedirecionar({ ...ctx, role: "ADMIN" }, movido, "tech")).toBe(true);
    // Os chamados que ficaram no setor antigo continuam visíveis à equipe dele, sem atendimento.
    expect(podeVer(equipe, movido, alvo)).toBe(true);
  });
  it("qualquer setor abre chamado e vê o que abriu", () => {
    expect(podeAbrir({ ...ctx, sectors: ["comercial"] }, config)).toBe(true);
    expect(podeVer(ctx, config, { ...alvo, createdById: "u" })).toBe(true);
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
  it("a busca da lista tem escopos por papel: só o chamado, o solicitante para o coordenador, tudo para a equipe", () => {
    expect(escoposDaBusca(ctx, config)).toEqual(["chamado"]);
    expect(escoposDaBusca({ ...ctx, role: "SECTOR_ADMIN" }, config)).toEqual(["chamado", "solicitante"]);
    expect(escoposDaBusca({ ...ctx, sectors: ["tech"] }, config)).toEqual(["chamado", "solicitante", "setor", "responsavel"]);
    expect(escoposDaBusca({ ...ctx, role: "ADMIN" }, config)).toContain("responsavel");
  });
});

// Um ou mais setores administram os chamados (12/11/2026, funcionalidade-640).
describe("vários setores administrando os chamados", () => {
  const varios = { enabled: true, sectorCode: "tech", sectorCodes: ["tech", "rh"] };
  const doRh = { ...alvo, handlingSectorCode: "rh" };
  const tech = { ...ctx, sectors: ["tech"], activeSector: "tech" }, rh = { ...ctx, sectors: ["rh"], activeSector: "rh" };
  it("cada equipe atende e vê o interno só do setor do chamado", () => {
    expect(podeOperar(rh, varios)).toBe(true);
    expect(setoresQueAtendo({ ...ctx, sectors: ["tech", "rh", "fiscal"] }, varios)).toEqual(["tech", "rh"]);
    expect(podeOperarNo(rh, varios, "rh")).toBe(true); expect(podeOperarNo(tech, varios, "rh")).toBe(false);
    expect(podeVer(rh, varios, doRh)).toBe(true); expect(podeVer(tech, varios, doRh)).toBe(false);
    expect(podeVerInternoNo(tech, varios, "rh")).toBe(false); expect(podeVerInternoNo({ ...ctx, role: "ADMIN" }, varios, "rh")).toBe(true);
    expect(podeVerInterno(rh, varios)).toBe(true);
  });
  it("a equipe responde no chamado do seu setor; a do outro setor, não", () => {
    expect(podeResponder(rh, varios, doRh, "EM_ANDAMENTO", true)).toBe(true);
    expect(podeResponder(tech, varios, doRh, "EM_ANDAMENTO", false)).toBe(false);
  });
  it("gestão vale no setor do chamado", () => {
    const gestorRh = { ...rh, role: "SECTOR_ADMIN" as const };
    expect(podeGerenciar(gestorRh, varios)).toBe(true);
    expect(podeGerenciarNo(gestorRh, varios, "rh")).toBe(true); expect(podeGerenciarNo(gestorRh, varios, "tech")).toBe(false);
  });
  it("redirecionar: a equipe do setor que atende e o administrador, só com dois ou mais setores", () => {
    expect(podeRedirecionar(rh, varios, "rh")).toBe(true);
    expect(podeRedirecionar(tech, varios, "rh")).toBe(false);
    expect(podeRedirecionar({ ...ctx, role: "ADMIN" }, varios, "rh")).toBe(true);
    expect(podeRedirecionar({ ...rh, role: "READONLY" }, varios, "rh")).toBe(false);
    expect(podeRedirecionar(tech, config, "tech")).toBe(false);
  });
  it("o setor escolhido vale se administra; senão vai para o padrão", () => {
    expect(setorQueAtende(varios, "rh")).toBe("rh");
    expect(setorQueAtende(varios, "fiscal")).toBe("tech");
    expect(setorQueAtende(varios, "")).toBe("tech");
  });
});
