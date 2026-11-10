import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_WIDGETS,
  LEGACY_TASK_WIDGETS,
  TASK_WIDGETS,
  lerBlocosGravados,
  padraoDoSetor,
  parseTaskWidgets,
  serializeTaskWidgets,
  visibleTaskWidgets,
  type TaskWidgetKey,
} from "./taskWidgets";

/** As chaves que vieram em 10/11/2026 — antes não desligavam. */
const NOVAS = DEFAULT_TASK_WIDGETS.filter((k) => !LEGACY_TASK_WIDGETS.includes(k));

describe("catálogo do Meu dia", () => {
  it("tudo o que a tela monta desliga: as cinco origens e os três blocos ao lado (10/11/2026)", () => {
    expect(TASK_WIDGETS.filter((w) => w.grupo === "origem").map((w) => w.key).sort()).toEqual(
      ["cards-kanban", "pendencias", "processos", "solicitacoes", "transferencias"].sort(),
    );
    expect(TASK_WIDGETS.filter((w) => w.grupo === "bloco").map((w) => w.key).sort()).toEqual(["prazos-semana", "reunioes", "societario"].sort());
    for (const w of TASK_WIDGETS) expect(w.label.length && w.description.length).toBeGreaterThan(0);
  });

  it("o padrão do setor que não usa reuniões vem sem Próximas reuniões", () => {
    expect(padraoDoSetor(true)).toEqual(DEFAULT_TASK_WIDGETS);
    expect(padraoDoSetor(false)).not.toContain("reunioes");
    expect(padraoDoSetor(false)).toHaveLength(DEFAULT_TASK_WIDGETS.length - 1);
  });
});

describe("parseTaskWidgets", () => {
  it("cai no padrão quando não há configuração", () => {
    expect(parseTaskWidgets(null)).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets(undefined)).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets("")).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets(null, padraoDoSetor(false))).toEqual(padraoDoSetor(false));
  });

  it("cai no padrão em JSON quebrado ou de outro formato", () => {
    expect(parseTaskWidgets("{{")).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets('{"a":1}')).toEqual(DEFAULT_TASK_WIDGETS);
  });

  // Lista vazia é escolha legítima ("este setor não usa nenhum destes blocos")
  // e NÃO pode virar o padrão — senão não haveria como esvaziar a tela.
  it("respeita a lista vazia gravada de propósito", () => {
    expect(parseTaskWidgets(serializeTaskWidgets([]))).toEqual([]);
  });

  // A lista gravada antes de 10/11/2026 só falava das três chaves de então:
  // as que vieram depois ficam no padrão, como a pessoa as via (fixas).
  it("a lista antiga decide só as três chaves de antes; as novas seguem o padrão", () => {
    expect(parseTaskWidgets("[]")).toEqual(NOVAS);
    expect(parseTaskWidgets('["reunioes"]')).toEqual(TASK_WIDGETS.filter((w) => w.key === "reunioes" || NOVAS.includes(w.key)).map((w) => w.key));
    expect(parseTaskWidgets("[]", ["processos"])).toEqual(["processos"]);
  });

  it("descarta chave desconhecida e duplicada", () => {
    expect(lerBlocosGravados('["reunioes","fantasma","reunioes"]')?.visiveis).toEqual(["reunioes"]);
    expect(lerBlocosGravados('{"visiveis":["processos","fantasma","processos"],"conhecidas":["processos","fantasma"]}')).toEqual({
      visiveis: ["processos"],
      conhecidas: ["processos"],
    });
  });

  it("a chave que a configuração não conhece segue o padrão de baixo", () => {
    const gravado = JSON.stringify({ visiveis: ["processos"], conhecidas: ["processos", "reunioes"] });
    // reunioes: conhecida e desligada; as outras: o padrão (aqui, só transferências).
    expect(parseTaskWidgets(gravado, ["transferencias", "reunioes"])).toEqual(["processos", "transferencias"]);
  });
});

describe("serializeTaskWidgets", () => {
  it("remove duplicata e chave inválida, e grava todas as chaves de hoje como conhecidas", () => {
    const sujo = ["reunioes", "reunioes", "fantasma"] as TaskWidgetKey[];
    expect(JSON.parse(serializeTaskWidgets(sujo))).toEqual({ visiveis: ["reunioes"], conhecidas: DEFAULT_TASK_WIDGETS });
  });

  it("faz ida e volta", () => {
    expect(parseTaskWidgets(serializeTaskWidgets(DEFAULT_TASK_WIDGETS))).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets(serializeTaskWidgets(["processos", "reunioes"]), [])).toEqual(["processos", "reunioes"]);
  });
});

describe("visibleTaskWidgets", () => {
  it("usa o padrão para quem não é de setor nenhum (visão global)", () => {
    expect(visibleTaskWidgets([], { fiscal: [] })).toEqual(DEFAULT_TASK_WIDGETS);
  });

  it("usa o padrão para setor ainda não configurado", () => {
    expect(visibleTaskWidgets(["fiscal"], {})).toEqual(DEFAULT_TASK_WIDGETS);
  });

  it("o padrão de cada setor pode depender do setor (usa reuniões ou não)", () => {
    const padrao = (code: string) => padraoDoSetor(code !== "fiscal");
    expect(visibleTaskWidgets(["fiscal"], {}, padrao)).not.toContain("reunioes");
    // Quem também é de um setor que usa reuniões vê o bloco: a soma.
    expect(visibleTaskWidgets(["fiscal", "bpo"], {}, padrao)).toContain("reunioes");
  });

  it("respeita a configuração do setor", () => {
    expect(visibleTaskWidgets(["bpo"], { bpo: ["cards-kanban"] })).toEqual(["cards-kanban"]);
  });

  it("soma os blocos de quem está em mais de um setor", () => {
    const config = { fiscal: ["transferencias"], bpo: ["cards-kanban"] } as Record<string, TaskWidgetKey[]>;
    expect(visibleTaskWidgets(["fiscal", "bpo"], config)).toEqual(["cards-kanban", "transferencias"]);
  });

  // Um setor sem nenhum bloco não pode apagar o que o outro setor precisa ver.
  it("um setor vazio não subtrai os blocos do outro", () => {
    const config = { fiscal: ["transferencias"], bpo: [] } as Record<string, TaskWidgetKey[]>;
    expect(visibleTaskWidgets(["fiscal", "bpo"], config)).toEqual(["transferencias"]);
  });

  it("entrega sempre na ordem do catálogo, não na ordem dos setores", () => {
    const config = { a: ["reunioes"], b: ["transferencias"] } as Record<string, TaskWidgetKey[]>;
    expect(visibleTaskWidgets(["a", "b"], config)).toEqual(["transferencias", "reunioes"]);
  });

  it("devolve vazio quando todos os setores do usuário estão vazios", () => {
    expect(visibleTaskWidgets(["a", "b"], { a: [], b: [] })).toEqual([]);
  });
});
