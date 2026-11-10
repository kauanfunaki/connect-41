import { describe, expect, it } from "vitest";
import {
  AGENDA_DO_SETOR_PADRAO,
  agendaDosSetoresNaTela,
  alternarFonte,
  fontesLigadas,
  fontesOcultasDaPessoa,
  ocultasDosSetores,
  usaReunioes,
  visaoInicial,
  type AgendaDoSetor,
} from "./agendaDoSetor";

// A Agenda por setor (10/11/2026, pedido do Kauan): pessoa > setor > código.

const semReuniao: AgendaDoSetor = { usaReunioes: false, fontesOcultas: ["contas", "dp"] };
const comReuniao: AgendaDoSetor = { usaReunioes: true, fontesOcultas: ["dp"] };
const porSetor = { fiscal: semReuniao, bpo: comReuniao };

describe("usa reuniões", () => {
  it("o setor sem linha usa (a Agenda de antes)", () => {
    expect(AGENDA_DO_SETOR_PADRAO.usaReunioes).toBe(true);
    expect(usaReunioes(["dp"], porSetor)).toBe(true);
  });

  it("o setor que diz que não usa", () => {
    expect(usaReunioes(["fiscal"], porSetor)).toBe(false);
  });

  it("quem está em mais de um setor usa se algum dos setores usa", () => {
    expect(usaReunioes(["fiscal", "bpo"], porSetor)).toBe(true);
  });

  it("sem setor (Admin, Super Admin): usa", () => {
    expect(usaReunioes([], porSetor)).toBe(true);
  });
});

describe("a visão em que a Agenda abre", () => {
  it("a última que a pessoa escolheu vale mais que o setor", () => {
    expect(visaoInicial({ fontesOcultas: null, visao: "mes" }, false)).toBe("mes");
    expect(visaoInicial({ fontesOcultas: null, visao: "prazos" }, true)).toBe("prazos");
  });

  it("sem escolha: Prazos para quem não usa reuniões, Semana para quem usa", () => {
    expect(visaoInicial(null, false)).toBe("prazos");
    expect(visaoInicial(null, true)).toBe("semana");
    expect(visaoInicial({ fontesOcultas: ["dp"], visao: null }, false)).toBe("prazos");
  });
});

describe("as fontes escondidas", () => {
  it("a escolha da pessoa vale mais que o setor", () => {
    expect(fontesOcultasDaPessoa({ fontesOcultas: ["guias"], visao: null }, ["fiscal"], porSetor)).toEqual({
      ocultas: ["guias"],
      origem: "pessoa",
    });
  });

  it("a escolha vazia da pessoa também é escolha: mostra todas", () => {
    expect(fontesOcultasDaPessoa({ fontesOcultas: [], visao: null }, ["fiscal"], porSetor)).toEqual({ ocultas: [], origem: "pessoa" });
  });

  it("sem a dela, o padrão do setor", () => {
    expect(fontesOcultasDaPessoa(null, ["fiscal"], porSetor)).toEqual({ ocultas: ["contas", "dp"], origem: "setor" });
  });

  it("sem setor configurado, o código: nenhuma escondida", () => {
    expect(fontesOcultasDaPessoa(null, ["dp"], porSetor)).toEqual({ ocultas: [], origem: "codigo" });
    expect(fontesOcultasDaPessoa(null, [], porSetor)).toEqual({ ocultas: [], origem: "codigo" });
  });

  it("em mais de um setor, só some o que todos escondem (a soma do que se vê)", () => {
    expect(ocultasDosSetores(["fiscal", "bpo"], porSetor)).toEqual(["dp"]);
    // Um setor sem linha mostra tudo, então nada some.
    expect(ocultasDosSetores(["fiscal", "dp"], porSetor)).toEqual([]);
  });

  it("ligadas: as que a pessoa alcança menos as escondidas", () => {
    expect(fontesLigadas(["obrigacoes", "guias", "tarefas"], ["guias", "contas"])).toEqual(["obrigacoes", "tarefas"]);
  });

  it("ligar e desligar grava a lista inteira, na ordem do catálogo", () => {
    expect(alternarFonte(["dp"], "obrigacoes", false)).toEqual(["obrigacoes", "dp"]);
    expect(alternarFonte(["obrigacoes", "dp"], "dp", true)).toEqual(["obrigacoes"]);
    expect(alternarFonte([], "guias", true)).toEqual([]);
  });
});

describe("a tela de configuração do setor", () => {
  it("mostra o que vale hoje e se há o que restaurar", () => {
    expect(agendaDosSetoresNaTela([{ code: "fiscal", label: "Fiscal" }, { code: "dp", label: "DP" }], porSetor)).toEqual([
      { code: "fiscal", rotulo: "Fiscal", usaReunioes: false, fontesOcultas: ["contas", "dp"], personalizado: true },
      { code: "dp", rotulo: "DP", usaReunioes: true, fontesOcultas: [], personalizado: false },
    ]);
  });
});
