import { describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/auth/context";
import {
  diaValendoDaSessao, mesAnterior, mesDoInstante, mesFechado, mesesParaEscolher, mesPorExtensoLongo, nivelDaDificuldadeDoHub, nivelDoHub,
  podeAdministrarAcademia, podeComecarValendo, podeFazerTeste, setorDoResultado,
} from "./regras";

// As regras da Academia sem banco (10/11/2026).

const ctx = (sobre: Partial<AuthContext> = {}): AuthContext => ({
  userId: "pessoa-1", tenantId: "esc-a", homeTenantId: "esc-a", role: "SECTOR_USER", sectors: ["fiscal"],
  subscriptionReadOnly: false, canSelfRegularizeSubscription: false, activeSector: null, ...sobre,
});

describe("nível do Hub", () => {
  it("dificuldade 1–2 fácil, 3 médio, 4–5 difícil", () => {
    expect([1, 2, 3, 4, 5].map(nivelDaDificuldadeDoHub)).toEqual(["facil", "facil", "medio", "dificil", "dificil"]);
  });
  it("o nível gravado em inglês", () => {
    expect(nivelDoHub("easy")).toBe("facil");
    expect(nivelDoHub(" Medium ")).toBe("medio");
    expect(nivelDoHub("hard")).toBe("dificil");
    expect(nivelDoHub("")).toBeNull();
    expect(nivelDoHub(null)).toBeNull();
  });
});

describe("a tentativa valendo do dia", () => {
  it("o dia é o de São Paulo: 23h30 do dia 10 em SP ainda é dia 10, mesmo já sendo 11 em UTC", () => {
    expect(diaValendoDaSessao(true, new Date("2026-11-11T02:30:00Z"))).toBe("2026-11-10");
    expect(diaValendoDaSessao(true, new Date("2026-11-11T03:30:00Z"))).toBe("2026-11-11");
  });
  it("treino livre não grava dia — não esbarra na chave única", () => {
    expect(diaValendoDaSessao(false, new Date("2026-11-10T12:00:00Z"))).toBeNull();
  });
  it("uma por nível: o nível já usado hoje trava, os outros não", () => {
    expect(podeComecarValendo(["facil"], "facil")).toBe(false);
    expect(podeComecarValendo(["facil"], "medio")).toBe(true);
    expect(podeComecarValendo([], "dificil")).toBe(true);
  });
});

describe("mês", () => {
  it("o mês é o de São Paulo", () => {
    expect(mesDoInstante(new Date("2026-12-01T02:00:00Z"))).toBe("2026-11");
    expect(mesDoInstante(new Date("2026-12-01T04:00:00Z"))).toBe("2026-12");
  });
  it("mês anterior vira o ano", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(mesAnterior("2026-11")).toBe("2026-10");
  });
  it("mês fechado é o que acabou (para o certificado)", () => {
    const agora = new Date("2026-11-10T12:00:00Z");
    expect(mesFechado("2026-10", agora)).toBe(true);
    expect(mesFechado("2026-11", agora)).toBe(false);
  });
  it("seletor e nome por extenso", () => {
    expect(mesesParaEscolher("2026-02", 4)).toEqual(["2026-02", "2026-01", "2025-12", "2025-11"]);
    expect(mesPorExtensoLongo("2026-11")).toBe("novembro de 2026");
  });
});

describe("quem pode", () => {
  it("administra: Administrador, Super Admin e o gestor da Tech — não o gestor de outro setor", () => {
    expect(podeAdministrarAcademia(ctx({ role: "ADMIN" }))).toBe(true);
    expect(podeAdministrarAcademia(ctx({ role: "SUPER_ADMIN" }))).toBe(true);
    expect(podeAdministrarAcademia(ctx({ role: "SECTOR_ADMIN", sectors: ["tech"] }))).toBe(true);
    expect(podeAdministrarAcademia(ctx({ role: "SECTOR_ADMIN", sectors: ["fiscal"] }))).toBe(false);
    expect(podeAdministrarAcademia(ctx({ role: "SECTOR_USER", sectors: ["tech"] }))).toBe(false);
    expect(podeAdministrarAcademia(ctx({ role: "READONLY" }))).toBe(false);
  });
  it("faz teste: toda a equipe, menos o Somente leitura, o escritório em somente leitura e o visitante", () => {
    expect(podeFazerTeste(ctx())).toBe(true);
    expect(podeFazerTeste(ctx({ role: "READONLY" }))).toBe(false);
    expect(podeFazerTeste(ctx({ subscriptionReadOnly: true }))).toBe(false);
    expect(podeFazerTeste(ctx({ role: "SUPER_ADMIN", tenantId: "esc-b" }))).toBe(false);
  });
  it("o setor gravado com o resultado: o ativo, se a pessoa é dele; senão o primeiro", () => {
    expect(setorDoResultado(ctx({ sectors: ["fiscal", "bpo"], activeSector: "fiscal" }))).toBe("fiscal");
    expect(setorDoResultado(ctx({ sectors: ["fiscal", "bpo"], activeSector: "dp" }))).toBe("bpo");
    expect(setorDoResultado(ctx({ sectors: [] }))).toBeNull();
  });
});
