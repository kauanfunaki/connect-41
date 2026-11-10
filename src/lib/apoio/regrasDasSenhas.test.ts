import { describe, expect, it } from "vitest";
import {
  type CredencialDaRegra,
  daLinhaDoBanco,
  ondeDasCompletas,
  ondeDasSoExistencia,
  opcoesAoCriar,
  opcoesAoEditar,
  podeEditarCredencial,
  podeExcluirCredencial,
  podeRestringirCredencial,
  podeRevelarCredencial,
  quemVeDe,
  recusaDaEdicao,
  recusaDeQuemVe,
  restricoesValidas,
  visaoNaLista,
} from "./regrasDasSenhas";

// Senha pessoal e "todos do setor, menos…" (10/11/2026, pedido do Kauan): quem
// vê, revela, edita e exclui cada tipo de credencial do cofre do BPO.

type Papel = "SUPER_ADMIN" | "ADMIN" | "READONLY" | "SECTOR_ADMIN" | "SECTOR_USER";
const quem = (userId: string, role: Papel, sectors: string[], subscriptionReadOnly = false) =>
  ({ tenantId: "t1", userId, role, sectors, subscriptionReadOnly }) as Parameters<typeof ondeDasCompletas>[0];

const PESSOAS = {
  dono: quem("dono", "SECTOR_USER", ["bpo"]),
  colega: quem("colega", "SECTOR_USER", ["bpo"]),
  coord: quem("coord", "SECTOR_ADMIN", ["bpo"]),
  admin: quem("admin", "ADMIN", []),
  super: quem("super", "SUPER_ADMIN", []),
  marcado: quem("marcado", "SECTOR_USER", ["bpo"]),
  leitura: quem("leitura", "READONLY", []),
  doDp: quem("dp1", "SECTOR_ADMIN", ["dp"]),
};
type Nome = keyof typeof PESSOAS;

const pessoal: CredencialDaRegra = { sectorCode: "bpo", visibility: "PESSOAL", createdById: "dono", restritos: [] };
const doSetor: CredencialDaRegra = { sectorCode: "bpo", visibility: "SETOR", createdById: "coord", restritos: [] };
const restrita: CredencialDaRegra = { ...doSetor, restritos: ["marcado"] };

/** [visão na lista, revela, edita, exclui] */
type Linha = [ReturnType<typeof visaoNaLista>, boolean, boolean, boolean];
const tudo = (ctx: (typeof PESSOAS)[Nome], c: CredencialDaRegra): Linha => [
  visaoNaLista(ctx, c),
  podeRevelarCredencial(ctx, c),
  podeEditarCredencial(ctx, c),
  podeExcluirCredencial(ctx, c),
];

const ESPERADO: Record<"pessoal" | "doSetor" | "restrita", Record<Nome, Linha>> = {
  // Só o dono vê e mexe; o administrador vê que existe e exclui, nunca revela.
  pessoal: {
    dono: ["completa", true, true, true],
    colega: [null, false, false, false],
    coord: [null, false, false, false],
    admin: ["existencia", false, false, true],
    super: ["existencia", false, false, true],
    marcado: [null, false, false, false],
    leitura: [null, false, false, false],
    doDp: [null, false, false, false],
  },
  // A regra de sempre: o setor revela, a coordenação edita, o administrador exclui.
  doSetor: {
    dono: ["completa", true, false, false],
    colega: ["completa", true, false, false],
    coord: ["completa", true, true, false],
    admin: ["completa", true, true, true],
    super: ["completa", true, true, true],
    marcado: ["completa", true, false, false],
    leitura: [null, false, false, false],
    doDp: [null, false, false, false],
  },
  // Quem está marcado não vê nem revela; o resto, como na do setor.
  restrita: {
    dono: ["completa", true, false, false],
    colega: ["completa", true, false, false],
    coord: ["completa", true, true, false],
    admin: ["completa", true, true, true],
    super: ["completa", true, true, true],
    marcado: [null, false, false, false],
    leitura: [null, false, false, false],
    doDp: [null, false, false, false],
  },
};

describe("quem vê, revela, edita e exclui", () => {
  const credenciais = { pessoal, doSetor, restrita };
  for (const tipo of Object.keys(ESPERADO) as (keyof typeof ESPERADO)[]) {
    for (const nome of Object.keys(PESSOAS) as Nome[]) {
      it(`${tipo} × ${nome}`, () => {
        expect(tudo(PESSOAS[nome], credenciais[tipo])).toEqual(ESPERADO[tipo][nome]);
      });
    }
  }

  it("a marca não vale para o administrador (gerencia tudo), mesmo se uma linha antiga o marcou", () => {
    const comAdminMarcado = { ...doSetor, restritos: ["admin"] };
    expect(tudo(PESSOAS.admin, comAdminMarcado)).toEqual(["completa", true, true, true]);
  });

  it("um coordenador marcado por outro não vê a credencial", () => {
    const marcadoCoord = { ...doSetor, createdById: "outra-coord", restritos: ["coord"] };
    expect(tudo(PESSOAS.coord, marcadoCoord)).toEqual([null, false, false, false]);
  });

  it("a marca não vale na pessoal (ela já é só do dono)", () => {
    expect(visaoNaLista(PESSOAS.dono, { ...pessoal, restritos: ["dono"] })).toBe("completa");
  });

  it("com a assinatura em somente leitura, nem o administrador nem o dono veem", () => {
    expect(visaoNaLista(quem("admin", "ADMIN", [], true), doSetor)).toBeNull();
    expect(visaoNaLista(quem("dono", "SECTOR_USER", ["bpo"], true), pessoal)).toBeNull();
  });

  it("o dono da pessoal que é administrador vê a dele inteira", () => {
    const doAdmin = { ...pessoal, createdById: "admin" };
    expect(tudo(PESSOAS.admin, doAdmin)).toEqual(["completa", true, true, true]);
    expect(visaoNaLista(PESSOAS.super, doAdmin)).toBe("existencia");
  });
});

describe("marcar quem não vê", () => {
  it("só quem coordena, numa credencial do setor que vê", () => {
    expect(podeRestringirCredencial(PESSOAS.coord, doSetor)).toBe(true);
    expect(podeRestringirCredencial(PESSOAS.admin, restrita)).toBe(true);
    expect(podeRestringirCredencial(PESSOAS.colega, doSetor)).toBe(false);
    expect(podeRestringirCredencial(PESSOAS.coord, pessoal)).toBe(false);
    expect(podeRestringirCredencial(PESSOAS.doDp, doSetor)).toBe(false);
  });

  it("fica só quem é elegível, sem quem cadastrou, sem quem marca e sem repetir", () => {
    const elegiveis = ["colega", "marcado", "coord", "outra"];
    expect(restricoesValidas(["colega", "admin", "coord", "marcado", "colega", "", "sumiu"], elegiveis, { criadorId: "coord", quemMarcaId: "outra" })).toEqual([
      "colega",
      "marcado",
    ]);
    expect(restricoesValidas(["colega", "outra"], elegiveis, { criadorId: "coord", quemMarcaId: "outra" })).toEqual(["colega"]);
  });
});

describe("as escolhas de quem vê", () => {
  it("ao criar: a coordenação tem as três; quem só usa o Repositório, a pessoal; fora do setor, nenhuma", () => {
    expect(opcoesAoCriar(PESSOAS.coord, "bpo")).toEqual(["SETOR", "RESTRITA", "PESSOAL"]);
    expect(opcoesAoCriar(PESSOAS.admin, "bpo")).toEqual(["SETOR", "RESTRITA", "PESSOAL"]);
    expect(opcoesAoCriar(PESSOAS.colega, "bpo")).toEqual(["PESSOAL"]);
    expect(opcoesAoCriar(PESSOAS.leitura, "bpo")).toEqual([]);
    expect(opcoesAoCriar(PESSOAS.doDp, "bpo")).toEqual([]);
  });

  it("ao editar: tornar pessoal só quem cadastrou; trazer a pessoal ao setor só o dono que coordena", () => {
    expect(opcoesAoEditar(PESSOAS.coord, doSetor)).toEqual(["SETOR", "RESTRITA", "PESSOAL"]);
    expect(opcoesAoEditar(quem("coord2", "SECTOR_ADMIN", ["bpo"]), doSetor)).toEqual(["SETOR", "RESTRITA"]);
    expect(opcoesAoEditar(PESSOAS.admin, doSetor)).toEqual(["SETOR", "RESTRITA"]);
    expect(opcoesAoEditar(PESSOAS.dono, pessoal)).toEqual(["PESSOAL"]);
    expect(opcoesAoEditar(PESSOAS.coord, { ...pessoal, createdById: "coord" })).toEqual(["SETOR", "RESTRITA", "PESSOAL"]);
    expect(opcoesAoEditar(PESSOAS.admin, pessoal)).toEqual([]);
    expect(opcoesAoEditar(PESSOAS.colega, doSetor)).toEqual([]);
  });

  it("a escolha de agora: pessoal, do setor com marca, ou do setor inteiro", () => {
    expect(quemVeDe(pessoal)).toBe("PESSOAL");
    expect(quemVeDe(restrita)).toBe("RESTRITA");
    expect(quemVeDe(doSetor)).toBe("SETOR");
  });

  it("as recusas não contam a quem não vê que a credencial existe", () => {
    expect(recusaDaEdicao(PESSOAS.colega, pessoal)).toBe("Credencial não encontrada.");
    expect(recusaDaEdicao(PESSOAS.marcado, restrita)).toBe("Credencial não encontrada.");
    expect(recusaDaEdicao(PESSOAS.admin, pessoal)).toBe("Só quem cadastrou edita uma credencial pessoal.");
    expect(recusaDaEdicao(PESSOAS.colega, doSetor)).toBe("Só a coordenação do setor pode editar credenciais.");
    expect(recusaDaEdicao(PESSOAS.coord, doSetor)).toBeNull();
    expect(recusaDeQuemVe(quem("coord2", "SECTOR_ADMIN", ["bpo"]), doSetor, "PESSOAL")).toBe("Só quem cadastrou a credencial pode torná-la pessoal.");
    expect(recusaDeQuemVe(PESSOAS.dono, pessoal, "SETOR")).toBe("Só a coordenação do setor cadastra credenciais do setor: esta continua pessoal.");
    expect(recusaDeQuemVe(PESSOAS.coord, doSetor, "RESTRITA")).toBeNull();
  });
});

describe("os filtros da lista", () => {
  it("a pessoa do setor: as do setor em que não está marcada, mais as pessoais dela", () => {
    expect(ondeDasCompletas(PESSOAS.colega, "bpo")).toEqual({
      tenantId: "t1",
      sectorCode: "bpo",
      OR: [{ visibility: "SETOR", restrictions: { none: { userId: "colega" } } }, { visibility: "PESSOAL", createdById: "colega" }],
    });
    expect(ondeDasSoExistencia(PESSOAS.colega, "bpo")).toBeNull();
    expect(ondeDasSoExistencia(PESSOAS.coord, "bpo")).toBeNull();
  });

  it("o administrador: todas as do setor, as pessoais dele inteiras e as dos outros só como existência", () => {
    expect(ondeDasCompletas(PESSOAS.admin, "bpo")).toEqual({
      tenantId: "t1",
      sectorCode: "bpo",
      OR: [{ visibility: "SETOR" }, { visibility: "PESSOAL", createdById: "admin" }],
    });
    expect(ondeDasSoExistencia(PESSOAS.super, "bpo")).toEqual({
      tenantId: "t1",
      sectorCode: "bpo",
      visibility: "PESSOAL",
      createdById: { not: "super" },
    });
  });

  it("fora do setor, nada", () => {
    expect(ondeDasCompletas(PESSOAS.doDp, "bpo")).toEqual({ tenantId: "t1", id: { in: [] } });
    expect(ondeDasSoExistencia(quem("admin", "ADMIN", [], true), "bpo")).toBeNull();
  });
});

describe("a linha do banco", () => {
  it("sem visibilidade é do setor; as marcas viram a lista de ids", () => {
    expect(daLinhaDoBanco({ sectorCode: "bpo", createdById: "coord", restrictions: [{ userId: "marcado" }] })).toEqual(restrita);
    expect(daLinhaDoBanco({ sectorCode: "bpo", visibility: "PESSOAL", createdById: "dono" })).toEqual(pessoal);
  });
});
