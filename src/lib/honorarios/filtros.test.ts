import { describe, expect, it } from "vitest";
import { filtrarHonorarios, fotoPendente, responsaveisDaLista } from "./filtros";
import type { EmpresaHonorario } from "./servidor/honorariosService";
import type { SituacaoHonorario } from "./regras/honorariosRegras";

function linha(
  razaoSocial: string,
  situacao: SituacaoHonorario,
  extra: Partial<EmpresaHonorario> & { responsavel?: string | null; cnpj?: string } = {},
): EmpresaHonorario {
  return {
    empresa: { id: razaoSocial, razaoSocial, cnpj: extra.cnpj ?? "11.111.111/0001-11", responsavel: extra.responsavel ?? null },
    situacao,
    alertas: [],
    valor: 1000,
    fonte: "documento",
    documento: null,
    fotoMaisRecente: null,
    manual: null,
    documentos: [],
    acessorias: { comparacao: "NAO_CONFERIDO", valor: null, identificador: null, situacao: null },
    ultimoEnvio: null,
    distrato: null,
    ...extra,
  } as EmpresaHonorario;
}

const lista = [
  linha("ALFA COMÉRCIO LTDA", "LIDO", { responsavel: "Ana", acessorias: { comparacao: "IGUAL", valor: 1000, identificador: null, situacao: null } }),
  linha("BETA SERVIÇOS", "CONFERIR", { responsavel: "Bia", cnpj: "22.333.444/0001-55" }),
  linha("GAMA FOTO", "LIDO", { fotoMaisRecente: {} as never }),
  linha("DELTA", "SEM_DOCUMENTO", { valor: null, fonte: null }),
  linha("ÉPSILON", "MANUAL", { fonte: "manual" }),
];
const nomes = (r: EmpresaHonorario[]) => r.map((e) => e.empresa.razaoSocial);

describe("filtrarHonorarios", () => {
  it("sem filtro devolve tudo", () => {
    expect(filtrarHonorarios(lista, {})).toHaveLength(5);
  });

  it('"acao" junta as situações que pedem alguém olhar', () => {
    expect(nomes(filtrarHonorarios(lista, { situacao: "acao" }))).toEqual(["BETA SERVIÇOS", "DELTA"]);
  });

  it("situação exata; valor desconhecido não filtra", () => {
    expect(nomes(filtrarHonorarios(lista, { situacao: "MANUAL" }))).toEqual(["ÉPSILON"]);
    expect(filtrarHonorarios(lista, { situacao: "QUALQUER" })).toHaveLength(5);
  });

  it("foto mais recente só conta quando o valor veio de documento", () => {
    expect(nomes(filtrarHonorarios(lista, { foto: "1" }))).toEqual(["GAMA FOTO"]);
    expect(fotoPendente(linha("X", "MANUAL", { fonte: "manual", fotoMaisRecente: {} as never }))).toBe(false);
  });

  it("comparação com o Acessórias", () => {
    expect(nomes(filtrarHonorarios(lista, { acessorias: "IGUAL" }))).toEqual(["ALFA COMÉRCIO LTDA"]);
  });

  it('responsável, inclusive "sem responsável"', () => {
    expect(nomes(filtrarHonorarios(lista, { responsavel: "Bia" }))).toEqual(["BETA SERVIÇOS"]);
    expect(filtrarHonorarios(lista, { responsavel: "__none__" })).toHaveLength(3);
  });

  it("busca sem acento pelo nome e pelo CNPJ (3+ dígitos)", () => {
    expect(nomes(filtrarHonorarios(lista, { busca: "comercio" }))).toEqual(["ALFA COMÉRCIO LTDA"]);
    expect(nomes(filtrarHonorarios(lista, { busca: "22.333" }))).toEqual(["BETA SERVIÇOS"]);
    expect(filtrarHonorarios(lista, { busca: "22" })).toHaveLength(0);
  });

  it("lista os responsáveis em ordem", () => {
    expect(responsaveisDaLista(lista)).toEqual(["Ana", "Bia"]);
  });
});
