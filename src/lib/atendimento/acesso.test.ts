import { describe, it, expect } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import {
  ehDaTriagem,
  podeAgirNoCiclo,
  podeAssumir,
  podeConfigurar,
  podeDecidirPedido,
  podeEncaminharDireto,
  podePedirEncaminhamento,
  podeResponder,
  podeVerCiclo,
  setoresDaPessoa,
  veTudo,
} from "./acesso";

const cfg = { enabled: true, triagem: "controladoria" };
const ctx = (x: Partial<AuthContext>): AuthContext =>
  ({ userId: "u1", tenantId: "t1", role: "SECTOR_USER", sectors: [], subscriptionReadOnly: false, activeSector: null, ...x }) as AuthContext;

const controladoria = ctx({ sectors: ["controladoria"] });
const fiscal = ctx({ userId: "ana", sectors: ["fiscal"] });
const dp = ctx({ userId: "carla", sectors: ["dp"] });
const admin = ctx({ userId: "adm", role: "ADMIN" });

const naTriagem = { situacao: "TRIAGEM" as const, sectorCode: null, assignedToId: null };
const noFiscal = { situacao: "NO_SETOR" as const, sectorCode: "fiscal", assignedToId: null };

describe("acesso ao Atendimento", () => {
  it("a triagem é o setor do módulo e o administrador", () => {
    expect(ehDaTriagem(controladoria, cfg)).toBe(true);
    expect(ehDaTriagem(admin, cfg)).toBe(true);
    expect(ehDaTriagem(fiscal, cfg)).toBe(false);
    expect(ehDaTriagem(controladoria, { ...cfg, enabled: false })).toBe(false);
  });

  it("o setor vê as conversas dele; outro setor, não", () => {
    expect(podeVerCiclo(fiscal, cfg, noFiscal)).toBe(true);
    expect(podeVerCiclo(dp, cfg, noFiscal)).toBe(false);
    expect(podeVerCiclo(fiscal, cfg, naTriagem)).toBe(false);
    expect(podeVerCiclo(controladoria, cfg, noFiscal)).toBe(true);
  });

  it("quem é responsável vê e age mesmo fora do setor", () => {
    const comCarla = { ...noFiscal, situacao: "EM_ATENDIMENTO" as const, assignedToId: "carla" };
    expect(podeVerCiclo(dp, cfg, comCarla)).toBe(true);
    expect(podeAgirNoCiclo(dp, cfg, comCarla)).toBe(true);
  });

  it("responder exige assumir antes", () => {
    expect(podeResponder(fiscal, cfg, noFiscal)).toBe(false);
    expect(podeAssumir(fiscal, cfg, noFiscal)).toBe(true);
    expect(podeResponder(fiscal, cfg, { ...noFiscal, situacao: "EM_ATENDIMENTO", assignedToId: "ana" })).toBe(true);
    expect(podeAssumir(fiscal, cfg, { ...noFiscal, situacao: "EM_ATENDIMENTO", assignedToId: "ana" })).toBe(false);
  });

  it("encerrado e somente leitura não agem", () => {
    expect(podeAgirNoCiclo(fiscal, cfg, { ...noFiscal, situacao: "ENCERRADO" })).toBe(false);
    expect(podeAgirNoCiclo(ctx({ role: "READONLY", sectors: ["fiscal"] }), cfg, noFiscal)).toBe(false);
    expect(podeAgirNoCiclo(ctx({ sectors: ["fiscal"], subscriptionReadOnly: true }), cfg, noFiscal)).toBe(false);
  });

  it("a triagem encaminha direto; o setor só pede, e a triagem decide", () => {
    expect(podeEncaminharDireto(controladoria, cfg, naTriagem)).toBe(true);
    expect(podeEncaminharDireto(fiscal, cfg, noFiscal)).toBe(false);
    expect(podePedirEncaminhamento(fiscal, cfg, noFiscal)).toBe(true);
    expect(podePedirEncaminhamento(controladoria, cfg, noFiscal)).toBe(false);
    expect(podePedirEncaminhamento(fiscal, cfg, naTriagem)).toBe(false);
    expect(podeDecidirPedido(controladoria, cfg)).toBe(true);
    expect(podeDecidirPedido(fiscal, cfg)).toBe(false);
  });

  it("configurar é do administrador ou do gestor da triagem", () => {
    expect(podeConfigurar(admin, cfg)).toBe(true);
    expect(podeConfigurar(ctx({ role: "SECTOR_ADMIN", sectors: ["controladoria"] }), cfg)).toBe(true);
    expect(podeConfigurar(controladoria, cfg)).toBe(false);
    expect(podeConfigurar(ctx({ role: "SECTOR_ADMIN", sectors: ["fiscal"] }), cfg)).toBe(false);
  });

  it("os setores em que a pessoa atende não incluem a triagem", () => {
    expect(setoresDaPessoa(ctx({ sectors: ["fiscal", "controladoria"] }), cfg, ["fiscal", "dp"])).toEqual(["fiscal"]);
    expect(setoresDaPessoa(admin, cfg, ["fiscal", "dp"])).toEqual(["fiscal", "dp"]);
  });
});

describe("quem vê todos os atendimentos", () => {
  const comLista = { ...cfg, veemTudo: [{ tipo: "PESSOA" as const, id: "carla", avisos: false }, { tipo: "SETOR" as const, id: "diretoria", avisos: true }] };
  const diretor = ctx({ userId: "rui", sectors: ["diretoria"] });
  it("a pessoa escolhida e quem é do setor escolhido veem qualquer conversa", () => {
    expect(veTudo(dp, comLista)).toBe(true);
    expect(veTudo(diretor, comLista)).toBe(true);
    expect(podeVerCiclo(dp, comLista, noFiscal)).toBe(true);
    expect(podeVerCiclo(diretor, comLista, naTriagem)).toBe(true);
  });
  it("ver não é agir: não assume nem responde fora do setor", () => {
    expect(podeAgirNoCiclo(diretor, comLista, noFiscal)).toBe(false);
    expect(podeAssumir(dp, comLista, noFiscal)).toBe(false);
  });
  it("sem estar na lista, nada muda", () => {
    expect(veTudo(fiscal, comLista)).toBe(false);
    expect(podeVerCiclo(dp, cfg, noFiscal)).toBe(false);
  });
});
