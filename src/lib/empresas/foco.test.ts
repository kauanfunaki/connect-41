import { describe, expect, it } from "vitest";
import {
  alcanceDoFoco,
  dentroDoFoco,
  descricaoDoFoco,
  empresaDoCookie,
  lerCookieDoFoco,
  matrizDoFoco,
  motivoForaDoFoco,
  telaDoFoco,
  valorDoCookieDoFoco,
  type EmpresaEmFoco,
} from "./foco";

// Uma empresa por vez no BPO (21/10/2026) — a regra pura. Os dois casos do
// escritório: a BLD, uma base só no Omie com a matriz e 21 filiais, e uma
// empresa sozinha, sem filial.

const FILIAIS_DA_BLD = Array.from({ length: 21 }, (_, i) => `bld-f${i + 1}`);
const BLD: EmpresaEmFoco = { companyId: "bld", nome: "BLD", logoUrl: null, matrizId: "bld", grupo: ["bld", ...FILIAIS_DA_BLD] };
const BLD_MOGI: EmpresaEmFoco = { ...BLD, companyId: "bld-f3", nome: "BLD MOGI" };
const PADARIA: EmpresaEmFoco = { companyId: "padaria", nome: "Padaria do Zé", logoUrl: null, matrizId: "padaria", grupo: ["padaria"] };

describe("o cookie do foco", () => {
  it("volta igual ao que foi gravado", () => {
    const c = { tenantId: "t1", userId: "u1", companyId: "bld" };
    expect(lerCookieDoFoco(valorDoCookieDoFoco(c))).toEqual(c);
  });

  it("mexido ou vazio não vale", () => {
    expect(lerCookieDoFoco(undefined)).toBeNull();
    expect(lerCookieDoFoco("")).toBeNull();
    expect(lerCookieDoFoco("t1.u1")).toBeNull();
    expect(lerCookieDoFoco("t1.u1.bld.extra")).toBeNull();
    expect(lerCookieDoFoco("t1.u1.<script>")).toBeNull();
  });

  it("só vale para o escritório e a pessoa que escolheram", () => {
    const c = { tenantId: "t1", userId: "u1", companyId: "bld" };
    expect(empresaDoCookie(c, { tenantId: "t1", userId: "u1" })).toBe("bld");
    // Quem trocou de escritório, ou o computador dividido com outra pessoa.
    expect(empresaDoCookie(c, { tenantId: "t2", userId: "u1" })).toBeNull();
    expect(empresaDoCookie(c, { tenantId: "t1", userId: "u2" })).toBeNull();
    expect(empresaDoCookie(null, { tenantId: "t1", userId: "u1" })).toBeNull();
  });
});

describe("a base: matriz e filiais juntas", () => {
  it("a matriz da filial é a matriz dela; a da matriz, ela mesma", () => {
    expect(matrizDoFoco({ id: "bld-f3", parentCompanyId: "bld" })).toBe("bld");
    expect(matrizDoFoco({ id: "bld", parentCompanyId: null })).toBe("bld");
  });

  it("na BLD, a matriz e as 21 filiais estão no foco — e a padaria não", () => {
    expect(dentroDoFoco(BLD, "bld")).toBe(true);
    expect(FILIAIS_DA_BLD.every((id) => dentroDoFoco(BLD_MOGI, id))).toBe(true);
    expect(dentroDoFoco(BLD, "padaria")).toBe(false);
  });

  it("sem foco, tudo está", () => {
    expect(dentroDoFoco(null, "qualquer")).toBe(true);
  });

  it("a faixa diz o alcance: as filiais, a matriz e as filiais, ou nada", () => {
    expect(alcanceDoFoco(BLD)).toBe("com 21 filiais");
    expect(alcanceDoFoco(BLD_MOGI)).toBe("com a matriz e 20 filiais");
    expect(alcanceDoFoco(PADARIA)).toBeNull();
    expect(alcanceDoFoco({ companyId: "f", matrizId: "m", grupo: ["m", "f"] })).toBe("com a matriz");
    expect(alcanceDoFoco({ companyId: "m", matrizId: "m", grupo: ["m", "f"] })).toBe("com 1 filial");
  });

  it("a descrição leva o alcance só quando há", () => {
    expect(descricaoDoFoco(BLD_MOGI)).toBe("BLD MOGI (com a matriz e 20 filiais)");
    expect(descricaoDoFoco(PADARIA)).toBe("Padaria do Zé");
  });
});

describe("a trava: por que a gravação é recusada", () => {
  it("sem foco, grava", () => {
    expect(motivoForaDoFoco(null, ["padaria"])).toBeNull();
  });

  it("com foco na BLD, grava na matriz e em qualquer filial", () => {
    expect(motivoForaDoFoco(BLD_MOGI, ["bld", "bld-f21"])).toBeNull();
  });

  it("uma empresa de fora no lote recusa tudo, e diz onde a pessoa está", () => {
    const motivo = motivoForaDoFoco(BLD, ["bld-f1", "padaria"]);
    expect(motivo).toMatch(/^Nada foi gravado/);
    expect(motivo).toContain("BLD (com 21 filiais)");
    expect(motivo).toContain("Trocar empresa");
  });

  it("empresa sem filial: só ela", () => {
    expect(motivoForaDoFoco(PADARIA, ["padaria"])).toBeNull();
    expect(motivoForaDoFoco(PADARIA, ["bld"])).toContain("Padaria do Zé");
  });

  it("na exportação, diz que nada foi exportado", () => {
    expect(motivoForaDoFoco(PADARIA, ["bld"], "exportar")).toMatch(/^Nada foi exportado/);
  });
});

describe("as telas do foco", () => {
  it("a raiz da tela, com o resto do caminho", () => {
    expect(telaDoFoco("/pagar")).toBe("/pagar");
    expect(telaDoFoco("/cobranca/abc")).toBe("/cobranca");
    expect(telaDoFoco("/tabela-dinamica")).toBe("/tabela-dinamica");
    // A mais comprida ganha: a DRE econômica é tela própria.
    expect(telaDoFoco("/dre/economica")).toBe("/dre/economica");
  });

  it("fora delas, a faixa não aparece", () => {
    expect(telaDoFoco("/empresas/bld")).toBeNull();
    expect(telaDoFoco("/pagarx")).toBeNull();
    expect(telaDoFoco("/")).toBeNull();
  });
});
