import { describe, expect, it } from "vitest";
import {
  DEFAULT_TASK_WIDGETS,
  parseTaskWidgets,
  serializeTaskWidgets,
  visibleTaskWidgets,
  type TaskWidgetKey,
} from "./taskWidgets";

describe("parseTaskWidgets", () => {
  it("cai no padrão quando não há configuração", () => {
    expect(parseTaskWidgets(null)).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets(undefined)).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets("")).toEqual(DEFAULT_TASK_WIDGETS);
  });

  it("cai no padrão em JSON quebrado ou de outro formato", () => {
    expect(parseTaskWidgets("{{")).toEqual(DEFAULT_TASK_WIDGETS);
    expect(parseTaskWidgets('{"a":1}')).toEqual(DEFAULT_TASK_WIDGETS);
  });

  // Lista vazia é escolha legítima ("este setor não usa nenhum destes blocos")
  // e NÃO pode virar o padrão — senão não haveria como esvaziar a tela.
  it("respeita a lista vazia gravada de propósito", () => {
    expect(parseTaskWidgets("[]")).toEqual([]);
  });

  it("descarta chave desconhecida e duplicada", () => {
    expect(parseTaskWidgets('["reunioes","fantasma","reunioes"]')).toEqual(["reunioes"]);
  });
});

describe("serializeTaskWidgets", () => {
  it("remove duplicata e chave inválida", () => {
    const sujo = ["reunioes", "reunioes", "fantasma"] as TaskWidgetKey[];
    expect(serializeTaskWidgets(sujo)).toBe('["reunioes"]');
  });

  it("faz ida e volta", () => {
    expect(parseTaskWidgets(serializeTaskWidgets(DEFAULT_TASK_WIDGETS))).toEqual(DEFAULT_TASK_WIDGETS);
  });
});

describe("visibleTaskWidgets", () => {
  it("usa o padrão para quem não é de setor nenhum (visão global)", () => {
    expect(visibleTaskWidgets([], { fiscal: [] })).toEqual(DEFAULT_TASK_WIDGETS);
  });

  it("usa o padrão para setor ainda não configurado", () => {
    expect(visibleTaskWidgets(["fiscal"], {})).toEqual(DEFAULT_TASK_WIDGETS);
  });

  it("respeita a configuração do setor", () => {
    expect(visibleTaskWidgets(["bpo"], { bpo: ["cards-kanban"] })).toEqual(["cards-kanban"]);
  });

  it("soma os blocos de quem está em mais de um setor", () => {
    const config = { fiscal: ["transferencias"], bpo: ["cards-kanban"] } as Record<string, TaskWidgetKey[]>;
    expect(visibleTaskWidgets(["fiscal", "bpo"], config)).toEqual(["transferencias", "cards-kanban"]);
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
