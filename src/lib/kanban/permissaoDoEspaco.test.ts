import { describe, expect, it } from "vitest";
import { lerPermissao, poderesNoEspaco, PERMISSOES_DO_ESPACO, type PermissaoDoEspaco } from "./permissaoDoEspaco";

const colaborador = { role: "SECTOR_USER" as const, sectors: ["bpo"], subscriptionReadOnly: false };
const coordenador = { role: "SECTOR_ADMIN" as const, sectors: ["bpo"], subscriptionReadOnly: false };
const admin = { role: "ADMIN" as const, sectors: [], subscriptionReadOnly: false };
const superAdmin = { role: "SUPER_ADMIN" as const, sectors: [], subscriptionReadOnly: false };
const diretoria = { role: "READONLY" as const, sectors: [], subscriptionReadOnly: false };

const espaco = (p: PermissaoDoEspaco) => ({ sectorCode: "bpo", defaultPermission: p });

describe("permissão padrão do espaço — o colaborador do setor", () => {
  it("Edição total: cria e edita, comenta e cria pasta; não gerencia nem exclui", () => {
    expect(poderesNoEspaco(colaborador, espaco("TOTAL"))).toEqual({
      ver: true, comentar: true, editar: true, criarPasta: true, gerenciar: false, excluir: false,
    });
  });

  it("Editar: cria e edita e comenta, sem pasta", () => {
    expect(poderesNoEspaco(colaborador, espaco("EDITAR"))).toEqual({
      ver: true, comentar: true, editar: true, criarPasta: false, gerenciar: false, excluir: false,
    });
  });

  it("Comentário: vê e comenta, sem editar", () => {
    expect(poderesNoEspaco(colaborador, espaco("COMENTAR"))).toEqual({
      ver: true, comentar: true, editar: false, criarPasta: false, gerenciar: false, excluir: false,
    });
  });

  it("Apenas exibição: só vê", () => {
    expect(poderesNoEspaco(colaborador, espaco("EXIBIR"))).toEqual({
      ver: true, comentar: false, editar: false, criarPasta: false, gerenciar: false, excluir: false,
    });
  });
});

describe("fora do nível", () => {
  it.each(PERMISSOES_DO_ESPACO)("o coordenador faz tudo menos excluir, em %s", (p) => {
    expect(poderesNoEspaco(coordenador, espaco(p))).toEqual({
      ver: true, comentar: true, editar: true, criarPasta: true, gerenciar: true, excluir: false,
    });
  });

  it.each(PERMISSOES_DO_ESPACO)("o administrador e o Super Admin fazem tudo e excluem, em %s", (p) => {
    for (const quem of [admin, superAdmin]) {
      expect(poderesNoEspaco(quem, espaco(p))).toEqual({
        ver: true, comentar: true, editar: true, criarPasta: true, gerenciar: true, excluir: true,
      });
    }
  });

  it.each(PERMISSOES_DO_ESPACO)("a Diretoria (somente leitura) só vê, mesmo em %s", (p) => {
    expect(poderesNoEspaco(diretoria, espaco(p))).toEqual({
      ver: true, comentar: false, editar: false, criarPasta: false, gerenciar: false, excluir: false,
    });
  });

  it("assinatura em somente leitura: só ver, até para o administrador", () => {
    const p = poderesNoEspaco({ ...admin, subscriptionReadOnly: true }, espaco("TOTAL"));
    expect(p).toEqual({ ver: true, comentar: false, editar: false, criarPasta: false, gerenciar: false, excluir: false });
  });

  it("quem é de outro setor nem vê — o coordenador de outro setor também não", () => {
    const nada = { ver: false, comentar: false, editar: false, criarPasta: false, gerenciar: false, excluir: false };
    expect(poderesNoEspaco({ ...colaborador, sectors: ["dp"] }, espaco("TOTAL"))).toEqual(nada);
    expect(poderesNoEspaco({ ...coordenador, sectors: ["dp"] }, espaco("TOTAL"))).toEqual(nada);
  });
});

describe("lerPermissao", () => {
  it("aceita só os quatro níveis", () => {
    expect(lerPermissao("COMENTAR")).toBe("COMENTAR");
    expect(lerPermissao("comentar")).toBeNull();
    expect(lerPermissao("ADMIN")).toBeNull();
    expect(lerPermissao(undefined)).toBeNull();
  });
});
