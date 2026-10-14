import { describe, expect, it } from "vitest";
import {
  contasDaEmpresa,
  empresasDaConta,
  empresasPeloCliente,
  idsDasEmpresasDaConta,
  ligacoesDoPreenchimento,
  nomeDoAcesso,
  type EmpresaDaRegra,
  type LigacaoDoAcesso,
} from "./empresasDaConta";

// O que se testa: a regra do portal por empresa (14/10/2026) — o que cada
// acesso enxerga e quem enxerga cada empresa —, e que a troca do Cliente pela
// ligação direta não tira empresa de ninguém.

const T = "escritorio-41";
const e = (id: string, extra: Partial<EmpresaDaRegra> = {}): EmpresaDaRegra => ({
  id,
  tenantId: T,
  parentCompanyId: null,
  status: "ACTIVE",
  ...extra,
});

// A BLD: matriz e quatro filiais (uma prospecto, uma inativa, uma cancelada),
// mais uma "neta" (filial da filial) e uma empresa solta.
const MATRIZ = e("bld-matriz");
const FILIAL = e("bld-mogi", { parentCompanyId: "bld-matriz" });
const PROSPECTO = e("bld-sul", { parentCompanyId: "bld-matriz", status: "PROSPECT" });
const INATIVA = e("bld-velha", { parentCompanyId: "bld-matriz", status: "INACTIVE" });
const CANCELADA = e("bld-fechada", { parentCompanyId: "bld-matriz", status: "CHURNED" });
const NETA = e("bld-mogi-2", { parentCompanyId: "bld-mogi" });
const SOLTA = e("irriga");
const TODAS = [MATRIZ, FILIAL, PROSPECTO, INATIVA, CANCELADA, NETA, SOLTA];

const ids = (m: Map<string, unknown>) => [...m.keys()].sort();

describe("empresasDaConta — o que o acesso enxerga", () => {
  it("ligada direto: só ela", () => {
    expect(ids(empresasDaConta(T, [{ companyId: "irriga", incluiFiliais: true }], TODAS))).toEqual(["irriga"]);
  });

  it("matriz com \"incluir filiais\": a matriz e as filiais em operação (prospecto entra; inativa e cancelada, não)", () => {
    const vistas = empresasDaConta(T, [{ companyId: "bld-matriz", incluiFiliais: true }], TODAS);
    expect(ids(vistas)).toEqual(["bld-matriz", "bld-mogi", "bld-sul"]);
    expect(vistas.get("bld-matriz")).toEqual({ tipo: "direto", incluiFiliais: true });
    expect(vistas.get("bld-mogi")).toEqual({ tipo: "matriz", matrizId: "bld-matriz" });
  });

  it("matriz sem \"incluir filiais\": só a matriz", () => {
    expect(ids(empresasDaConta(T, [{ companyId: "bld-matriz", incluiFiliais: false }], TODAS))).toEqual(["bld-matriz"]);
  });

  it("empresa inativa ligada direto continua aparecendo (o histórico dela), como na regra do Cliente", () => {
    expect(ids(empresasDaConta(T, [{ companyId: "bld-velha", incluiFiliais: true }], TODAS))).toEqual(["bld-velha"]);
  });

  it("a filial inativa ligada direto também aparece — direto vale mais que a matriz", () => {
    const vistas = empresasDaConta(
      T,
      [
        { companyId: "bld-matriz", incluiFiliais: true },
        { companyId: "bld-velha", incluiFiliais: false },
      ],
      TODAS
    );
    expect(ids(vistas)).toEqual(["bld-matriz", "bld-mogi", "bld-sul", "bld-velha"]);
    expect(vistas.get("bld-velha")).toEqual({ tipo: "direto", incluiFiliais: false });
  });

  it("um nível só: a filial da filial não entra pela matriz de cima", () => {
    expect(ids(empresasDaConta(T, [{ companyId: "bld-matriz", incluiFiliais: true }], TODAS))).not.toContain("bld-mogi-2");
    // Pela própria matriz dela, entra.
    expect(ids(empresasDaConta(T, [{ companyId: "bld-mogi", incluiFiliais: true }], TODAS))).toEqual(["bld-mogi", "bld-mogi-2"]);
  });

  it("filial cadastrada depois aparece sozinha para quem tem a matriz com as filiais", () => {
    const antes = empresasDaConta(T, [{ companyId: "bld-matriz", incluiFiliais: true }], TODAS);
    const nova = e("bld-nova", { parentCompanyId: "bld-matriz", status: "PROSPECT" });
    const depois = empresasDaConta(T, [{ companyId: "bld-matriz", incluiFiliais: true }], [...TODAS, nova]);
    expect(antes.has("bld-nova")).toBe(false);
    expect(depois.get("bld-nova")).toEqual({ tipo: "matriz", matrizId: "bld-matriz" });
  });

  it("outro escritório não vaza: nem a empresa ligada, nem filial de lá apontando para a matriz daqui", () => {
    const deLa = e("de-la", { tenantId: "outro" });
    const filialDeLa = e("filial-de-la", { tenantId: "outro", parentCompanyId: "bld-matriz" });
    const vistas = empresasDaConta(
      T,
      [
        { companyId: "bld-matriz", incluiFiliais: true },
        { companyId: "de-la", incluiFiliais: true },
      ],
      [...TODAS, deLa, filialDeLa]
    );
    expect(ids(vistas)).toEqual(["bld-matriz", "bld-mogi", "bld-sul"]);
  });

  it("sem ligação nenhuma: nada — nunca tudo", () => {
    expect(idsDasEmpresasDaConta(T, [], TODAS)).toEqual([]);
  });

  it("ligação para empresa que não existe mais não inventa empresa", () => {
    expect(idsDasEmpresasDaConta(T, [{ companyId: "apagada", incluiFiliais: true }], TODAS)).toEqual([]);
  });
});

describe("contasDaEmpresa — quem recebe o aviso", () => {
  const LIGACOES: LigacaoDoAcesso[] = [
    { portalUserId: "ana", companyId: "bld-matriz", incluiFiliais: true },
    { portalUserId: "bia", companyId: "bld-matriz", incluiFiliais: false },
    { portalUserId: "caio", companyId: "bld-mogi", incluiFiliais: true },
    { portalUserId: "duda", companyId: "irriga", incluiFiliais: true },
  ];

  it("a matriz: quem está ligado a ela, com ou sem as filiais", () => {
    expect(ids(contasDaEmpresa(MATRIZ, null, LIGACOES))).toEqual(["ana", "bia"]);
  });

  it("a filial: quem está ligado a ela e quem tem a matriz com as filiais", () => {
    const contas = contasDaEmpresa(FILIAL, MATRIZ, LIGACOES);
    expect(ids(contas)).toEqual(["ana", "caio"]);
    expect(contas.get("ana")).toEqual({ tipo: "matriz", matrizId: "bld-matriz" });
    expect(contas.get("caio")).toEqual({ tipo: "direto", incluiFiliais: true });
  });

  it("filial inativa não avisa quem só tem a matriz", () => {
    expect(ids(contasDaEmpresa(INATIVA, MATRIZ, LIGACOES))).toEqual([]);
  });

  it("matriz de outro escritório não passa ninguém pela matriz (o ligado direto continua)", () => {
    expect(ids(contasDaEmpresa(FILIAL, { id: "bld-matriz", tenantId: "outro" }, LIGACOES))).toEqual(["caio"]);
  });

  it("é o espelho de empresasDaConta: X vê a empresa ⇔ a empresa tem X entre as contas", () => {
    const contas = ["ana", "bia", "caio", "duda"];
    const porId = new Map(TODAS.map((x) => [x.id, x]));
    for (const conta of contas) {
      const vistas = empresasDaConta(
        T,
        LIGACOES.filter((l) => l.portalUserId === conta),
        TODAS
      );
      for (const empresa of TODAS) {
        const matriz = empresa.parentCompanyId ? (porId.get(empresa.parentCompanyId) ?? null) : null;
        const veem = contasDaEmpresa(empresa, matriz, LIGACOES);
        expect(veem.has(conta), `${conta} × ${empresa.id}`).toBe(vistas.has(empresa.id));
        if (vistas.has(empresa.id)) expect(veem.get(conta)).toEqual(vistas.get(empresa.id));
      }
    }
  });
});

describe("a troca do Cliente pela ligação direta (migration 20261014210000)", () => {
  // Hoje: a conta vê as empresas com o mesmo cliente (`clientGroupId`). O
  // cliente "bld" tem a matriz e duas filiais; a filial "bld-sul" não foi posta
  // no cliente; a "bld-velha" (inativa) foi.
  const EMPRESAS = [
    { ...MATRIZ, clientGroupId: "bld" },
    { ...FILIAL, clientGroupId: "bld" },
    { ...INATIVA, clientGroupId: "bld" },
    { ...PROSPECTO, clientGroupId: null },
    { ...CANCELADA, clientGroupId: null },
    { ...NETA, clientGroupId: null },
    { ...SOLTA, clientGroupId: "irriga" },
    { ...e("bld-de-outro", { tenantId: "outro" }), clientGroupId: "bld" },
  ];
  const CONTAS = [
    { id: "ana", tenantId: T, clientGroupId: "bld" },
    { id: "duda", tenantId: T, clientGroupId: "irriga" },
    { id: "sem-cliente", tenantId: T, clientGroupId: null },
    { id: "vazio", tenantId: T, clientGroupId: "cliente-sem-empresa" },
  ];

  for (const conta of CONTAS) {
    it(`${conta.id}: ninguém perde empresa, e só ganha filial em operação da matriz`, () => {
      const hoje = new Set(empresasPeloCliente(conta, EMPRESAS));
      const depois = new Set(idsDasEmpresasDaConta(T, ligacoesDoPreenchimento(conta, EMPRESAS), EMPRESAS));
      expect([...hoje].filter((id) => !depois.has(id)), "perderia").toEqual([]);
      for (const ganhou of [...depois].filter((id) => !hoje.has(id))) {
        const empresa = EMPRESAS.find((x) => x.id === ganhou)!;
        expect(empresa.parentCompanyId && hoje.has(empresa.parentCompanyId), ganhou).toBeTruthy();
        expect(["INACTIVE", "CHURNED"]).not.toContain(empresa.status);
      }
    });
  }

  it("a conta da BLD ganha a filial que não estava no cliente, e continua com a inativa que estava", () => {
    const ana = CONTAS[0]!;
    const depois = idsDasEmpresasDaConta(T, ligacoesDoPreenchimento(ana, EMPRESAS), EMPRESAS).sort();
    expect(depois).toEqual(["bld-matriz", "bld-mogi", "bld-mogi-2", "bld-sul", "bld-velha"]);
  });

  it("o preenchimento liga direto, com as filiais, só as empresas do cliente no escritório da conta", () => {
    expect(ligacoesDoPreenchimento(CONTAS[0]!, EMPRESAS)).toEqual([
      { portalUserId: "ana", companyId: "bld-matriz", incluiFiliais: true },
      { portalUserId: "ana", companyId: "bld-mogi", incluiFiliais: true },
      { portalUserId: "ana", companyId: "bld-velha", incluiFiliais: true },
    ]);
    expect(ligacoesDoPreenchimento(CONTAS[2]!, EMPRESAS)).toEqual([]);
  });
});

describe("nomeDoAcesso — o nome no topo do portal (era o do Cliente)", () => {
  it("uma empresa: o nome dela; várias: a primeira em ordem e quantas mais; nenhuma: nada", () => {
    expect(nomeDoAcesso(["BLD MOGI"])).toBe("BLD MOGI");
    expect(nomeDoAcesso(["BLD MOGI", "BLD MATRIZ", "BLD SUL"])).toBe("BLD MATRIZ e mais 2 empresas");
    expect(nomeDoAcesso(["B", "A"])).toBe("A e mais 1 empresa");
    expect(nomeDoAcesso([])).toBeNull();
  });
});
