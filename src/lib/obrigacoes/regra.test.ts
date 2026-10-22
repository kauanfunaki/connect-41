import { describe, expect, it } from "vitest";
import { feriadosNacionais } from "@/lib/datas/feriadosNacionais";
import { datasDaCompetencia, proximasOcorrencias, type RegraDeData } from "./calendario";
import {
  empresaAtende,
  lerListaJson,
  normalizarCidade,
  planejarGeracao,
  situacaoDosFuncionarios,
  type EmpresaDaRegra,
  type ObrigacaoExistente,
  type RegraDeAplicacao,
} from "./regra";

const QUALQUER: RegraDeAplicacao = {
  regimes: [],
  semMovimento: "QUALQUER",
  comFuncionarios: "QUALQUER",
  estados: [],
  cidades: [],
  exigeSetorContratado: false,
};

const empresa = (extra: Partial<EmpresaDaRegra> = {}): EmpresaDaRegra => ({
  id: "e1",
  taxRegimeKind: "SIMPLES_NACIONAL",
  taxNoMovement: false,
  taxHasEmployees: null,
  colaboradoresAtivos: 0,
  stateCode: "SP",
  city: "São Paulo",
  setoresContratados: ["fiscal"],
  ...extra,
});

describe("a regra de aplicação", () => {
  it("sem filtro, toda empresa atende", () => {
    expect(empresaAtende(empresa({ taxRegimeKind: null, stateCode: null, city: null, setoresContratados: [] }), QUALQUER, "fiscal")).toBe(true);
  });

  it("regime: lista de regimes; empresa sem regime não entra quando há lista", () => {
    const r = { ...QUALQUER, regimes: ["SIMPLES_NACIONAL", "MEI"] };
    expect(empresaAtende(empresa(), r, "fiscal")).toBe(true);
    expect(empresaAtende(empresa({ taxRegimeKind: "MEI" }), r, "fiscal")).toBe(true);
    expect(empresaAtende(empresa({ taxRegimeKind: "LUCRO_PRESUMIDO" }), r, "fiscal")).toBe(false);
    expect(empresaAtende(empresa({ taxRegimeKind: null }), r, "fiscal")).toBe(false);
  });

  it("sem movimento: só quem tem, ou só quem não tem", () => {
    expect(empresaAtende(empresa({ taxNoMovement: true }), { ...QUALQUER, semMovimento: "NAO" }, "fiscal")).toBe(false);
    expect(empresaAtende(empresa({ taxNoMovement: false }), { ...QUALQUER, semMovimento: "NAO" }, "fiscal")).toBe(true);
    expect(empresaAtende(empresa({ taxNoMovement: false }), { ...QUALQUER, semMovimento: "SIM" }, "fiscal")).toBe(false);
  });

  it("funcionários: o regime diz, ou o DP tem colaborador; Presumido sem DP não se sabe", () => {
    expect(situacaoDosFuncionarios({ taxHasEmployees: true, colaboradoresAtivos: 0 })).toBe("SIM");
    expect(situacaoDosFuncionarios({ taxHasEmployees: false, colaboradoresAtivos: 3 })).toBe("SIM");
    expect(situacaoDosFuncionarios({ taxHasEmployees: null, colaboradoresAtivos: 2 })).toBe("SIM");
    expect(situacaoDosFuncionarios({ taxHasEmployees: false, colaboradoresAtivos: 0 })).toBe("NAO");
    expect(situacaoDosFuncionarios({ taxHasEmployees: null, colaboradoresAtivos: 0 })).toBe("NAO_SE_SABE");
    const com = { ...QUALQUER, comFuncionarios: "SIM" as const };
    const sem = { ...QUALQUER, comFuncionarios: "NAO" as const };
    const naoSeSabe = empresa({ taxHasEmployees: null });
    expect(empresaAtende(naoSeSabe, com, "fiscal")).toBe(false);
    expect(empresaAtende(naoSeSabe, sem, "fiscal")).toBe(false);
    expect(empresaAtende(empresa({ colaboradoresAtivos: 1 }), com, "fiscal")).toBe(true);
  });

  it("estado e cidade, sem acento nem maiúscula", () => {
    expect(empresaAtende(empresa(), { ...QUALQUER, estados: ["sp"] }, "fiscal")).toBe(true);
    expect(empresaAtende(empresa(), { ...QUALQUER, estados: ["MG", "RJ"] }, "fiscal")).toBe(false);
    expect(empresaAtende(empresa(), { ...QUALQUER, cidades: ["sao paulo"] }, "fiscal")).toBe(true);
    expect(empresaAtende(empresa({ city: "  SÃO   PAULO " }), { ...QUALQUER, cidades: ["São Paulo"] }, "fiscal")).toBe(true);
    expect(empresaAtende(empresa({ city: null }), { ...QUALQUER, cidades: ["São Paulo"] }, "fiscal")).toBe(false);
    expect(normalizarCidade("Mogi das Cruzes")).toBe("mogi das cruzes");
  });

  it("setor contratado", () => {
    const r = { ...QUALQUER, exigeSetorContratado: true };
    expect(empresaAtende(empresa(), r, "fiscal")).toBe(true);
    expect(empresaAtende(empresa(), r, "dp")).toBe(false);
  });

  it("lista JSON: só textos não vazios", () => {
    expect(lerListaJson(["SP", "", 3, " MG "])).toEqual(["SP", "MG"]);
    expect(lerListaJson(null)).toEqual([]);
    expect(lerListaJson("SP")).toEqual([]);
  });
});

// ─── O plano ────────────────────────────────────────────────────────────────

const FERIADOS = new Set([2026, 2027].flatMap((a) => feriadosNacionais(a).map((f) => f.data)));
const DAS: RegraDeData = { periodicidade: "MENSAL", mesesAposCompetencia: 1, diaLegal: 20, diasUteisAntes: 0, ajuste: "ADIAR" };
const HOJE = "2026-10-22";
const OCORRENCIAS = proximasOcorrencias(DAS, HOJE, FERIADOS);
const datasDe = (comp: string) => datasDaCompetencia(DAS, comp, FERIADOS);

function existente(companyId: string, competencia: string, extra: Partial<ObrigacaoExistente> = {}): ObrigacaoExistente {
  const d = datasDe(competencia)!;
  return {
    id: `${companyId}-${competencia}`,
    companyId,
    competencia,
    dataLegal: d.dataLegal,
    prazoInterno: d.prazoInterno,
    pipelineItemId: `item-${companyId}-${competencia}`,
    concluida: false,
    ...extra,
  };
}

describe("o plano da geração", () => {
  it("cria empresa × próximas competências", () => {
    const plano = planejarGeracao({ ativo: true, empresasQueAtendem: ["a", "b"], ocorrencias: OCORRENCIAS, existentes: [], hoje: HOJE, datasDe });
    expect(plano.criar.map((c) => `${c.companyId}:${c.datas.competencia}`)).toEqual([
      "a:2026-10",
      "a:2026-11",
      "a:2026-12",
      "b:2026-10",
      "b:2026-11",
      "b:2026-12",
    ]);
    expect(plano.remover).toEqual([]);
  });

  it("é idempotente: rodar de novo com o que foi gerado não cria nada", () => {
    const existentes = ["2026-10", "2026-11", "2026-12"].map((c) => existente("a", c));
    const plano = planejarGeracao({ ativo: true, empresasQueAtendem: ["a"], ocorrencias: OCORRENCIAS, existentes, hoje: HOJE, datasDe });
    expect(plano).toEqual({ criar: [], remover: [], reprogramar: [] });
  });

  it("competência excluída à mão no kanban (sem atividade) não volta", () => {
    const plano = planejarGeracao({
      ativo: true,
      empresasQueAtendem: ["a"],
      ocorrencias: OCORRENCIAS,
      existentes: [existente("a", "2026-10", { pipelineItemId: null })],
      hoje: HOJE,
      datasDe,
    });
    expect(plano.criar.map((c) => c.datas.competencia)).toEqual(["2026-11", "2026-12"]);
  });

  it("empresa que mudou de regime perde só as futuras não concluídas", () => {
    const existentes = [
      existente("a", "2026-08", { dataLegal: "2026-09-21" }), // passada
      existente("a", "2026-10", { concluida: true }), // futura, mas concluída
      existente("a", "2026-11"), // futura, aberta → sai
      existente("a", "2026-12", { pipelineItemId: null }), // excluída à mão → fica a marca
    ];
    const plano = planejarGeracao({ ativo: true, empresasQueAtendem: [], ocorrencias: OCORRENCIAS, existentes, hoje: HOJE, datasDe });
    expect(plano.remover.map((e) => e.competencia)).toEqual(["2026-11"]);
    expect(plano.criar).toEqual([]);
  });

  it("modelo desligado tira as futuras abertas de todo mundo", () => {
    const plano = planejarGeracao({
      ativo: false,
      empresasQueAtendem: ["a"],
      ocorrencias: OCORRENCIAS,
      existentes: [existente("a", "2026-10"), existente("a", "2026-11")],
      hoje: HOJE,
      datasDe,
    });
    expect(plano.remover).toHaveLength(2);
    expect(plano.criar).toEqual([]);
  });

  it("a data legal de hoje não é futura: fica", () => {
    const plano = planejarGeracao({
      ativo: true,
      empresasQueAtendem: [],
      ocorrencias: [],
      existentes: [existente("a", "2026-10", { dataLegal: HOJE })],
      hoje: HOJE,
      datasDe,
    });
    expect(plano.remover).toEqual([]);
  });

  it("modelo editado reprograma as futuras abertas", () => {
    const novoDia = (comp: string) => datasDaCompetencia({ ...DAS, diaLegal: 25 }, comp, FERIADOS);
    const plano = planejarGeracao({
      ativo: true,
      empresasQueAtendem: ["a"],
      ocorrencias: proximasOcorrencias({ ...DAS, diaLegal: 25 }, HOJE, FERIADOS),
      existentes: [existente("a", "2026-10"), existente("a", "2026-11", { concluida: true }), existente("a", "2026-12")],
      hoje: HOJE,
      datasDe: novoDia,
    });
    expect(plano.reprogramar.map((r) => [r.existente.competencia, r.datas.dataLegal])).toEqual([
      ["2026-10", "2026-11-25"],
      ["2026-12", "2027-01-25"],
    ]);
  });

  it("troca de mensal para trimestral tira as competências que deixaram de existir", () => {
    const trimestral: RegraDeData = { ...DAS, periodicidade: "TRIMESTRAL" };
    const plano = planejarGeracao({
      ativo: true,
      empresasQueAtendem: ["a"],
      ocorrencias: proximasOcorrencias(trimestral, HOJE, FERIADOS),
      existentes: [existente("a", "2026-10"), existente("a", "2026-11"), existente("a", "2026-12")],
      hoje: HOJE,
      datasDe: (c) => datasDaCompetencia(trimestral, c, FERIADOS),
    });
    expect(plano.remover.map((e) => e.competencia)).toEqual(["2026-10", "2026-11"]);
    expect(plano.criar).toEqual([]);
  });
});
