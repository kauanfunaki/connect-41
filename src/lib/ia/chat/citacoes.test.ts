import { describe, expect, it } from "vitest";
import { recorteDaGestao } from "@/lib/gestao/regras";
import { citacoesDoTexto, filtrarCitacoes, idsNoTexto, partesComCitacoes, setoresDaEquipe } from "./citacoes";

const ANA = "0b6c2f7e-1d3a-4c5b-9e8f-112233445566";
const BRUNO = "7a1e9c3d-2b4f-4e6a-8c9d-aabbccddeeff";

describe("citações na resposta", () => {
  it("colhe os ids do resultado da ferramenta", () => {
    expect(idsNoTexto(JSON.stringify({ pessoas: [{ id: ANA.toUpperCase(), nome: "Ana" }] }))).toEqual([ANA]);
  });

  it("id que a execução não viu vira só o nome — a IA não cita quem a pessoa não enxerga", () => {
    const texto = `Hoje @[Ana Lima](usuario:${ANA}) moveu 4 cards e @[Bruno](usuario:${BRUNO}) comentou.`;
    expect(filtrarCitacoes(texto, new Set([ANA]))).toBe(`Hoje @[Ana Lima](usuario:${ANA}) moveu 4 cards e Bruno comentou.`);
  });

  it("separa texto e citações, na ordem, sem repetir na lista", () => {
    const linha = `- @[Ana](usuario:${ANA}): 3 etapas; de novo @[Ana](usuario:${ANA})`;
    expect(partesComCitacoes(linha).map((p) => ("texto" in p ? p.texto : `<${p.nome}>`))).toEqual(["- ", "<Ana>", ": 3 etapas; de novo ", "<Ana>"]);
    expect(citacoesDoTexto(linha)).toHaveLength(1);
  });

  it("formato quebrado não vira citação", () => {
    expect(citacoesDoTexto("@[Ana](usuario:123) e @[Ana](cliente:" + ANA + ")")).toEqual([]);
  });
});

// Teste de perfil restrito (obrigatório no desenho): quem recebe a atividade da equipe.
describe("atividade da equipe: quem enxerga", () => {
  const recorte = (role: string, sectors: string[]) => recorteDaGestao({ role, sectors });

  it("funcionário comum não recebe", () => {
    expect(setoresDaEquipe(recorte("SECTOR_USER", ["dp"]), "dp", true)).toEqual([]);
  });

  it("coordenador de um setor não vê o outro", () => {
    expect(setoresDaEquipe(recorte("SECTOR_ADMIN", ["dp"]), "dp", true)).toEqual(["dp"]);
    expect(setoresDaEquipe(recorte("SECTOR_ADMIN", ["dp"]), "bpo", true)).toEqual([]);
  });

  it("coordenador de dois setores vê os dois, cada um na IA do setor", () => {
    expect(setoresDaEquipe(recorte("SECTOR_ADMIN", ["dp", "bpo"]), "dp", true)).toEqual(["dp"]);
    expect(setoresDaEquipe(recorte("SECTOR_ADMIN", ["dp", "bpo"]), "bpo", true)).toEqual(["bpo"]);
  });

  it("diretoria e admin veem a equipe do setor do agente", () => {
    expect(setoresDaEquipe(recorte("ADMIN", []), "fiscal", true)).toEqual(["fiscal"]);
    expect(setoresDaEquipe(recorte("READONLY", []), "fiscal", true)).toEqual(["fiscal"]);
  });

  it("módulo da Gestão desligado deixa todo mundo de fora", () => {
    expect(setoresDaEquipe(recorte("ADMIN", []), "dp", false)).toEqual([]);
  });

  it("a Ajuda (sem setor) não tem equipe", () => {
    expect(setoresDaEquipe(recorte("ADMIN", []), null, true)).toEqual([]);
  });
});
