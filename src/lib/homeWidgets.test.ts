import { describe, expect, it } from "vitest";
import { DEFAULT_HOME_WIDGETS, parseHomeWidgets, serializeHomeWidgets, visibleWidgets, widgetsDisponiveis } from "./homeWidgets";

describe("parseHomeWidgets", () => {
  it("sem preferência, tudo visível", () => {
    expect(parseHomeWidgets(null)).toEqual(DEFAULT_HOME_WIDGETS);
    expect(parseHomeWidgets("{quebrado")).toEqual(DEFAULT_HOME_WIDGETS);
  });

  it("formato antigo: o que era da época e sumiu da lista está oculto; os painéis novos aparecem", () => {
    const lidos = parseHomeWidgets(JSON.stringify(["agenda", "meu-dia", "chave-que-nao-existe", "agenda"]));
    expect(lidos.slice(0, 2)).toEqual(["agenda", "meu-dia"]);
    expect(lidos).not.toContain("indicadores");
    expect(lidos).toContain("painel-tarefas");
    expect(lidos).toContain("painel-contas");
  });

  it("formato novo: respeita os ocultos e acrescenta só o que nunca foi visto", () => {
    const raw = serializeHomeWidgets(["meu-dia", "painel-contas"], ["painel-tarefas", "indicadores"]);
    const lidos = parseHomeWidgets(raw);
    expect(lidos.slice(0, 2)).toEqual(["meu-dia", "painel-contas"]);
    expect(lidos).not.toContain("painel-tarefas");
    expect(lidos).not.toContain("indicadores");
    expect(lidos).toContain("agenda");
  });
});

describe("painéis de setor", () => {
  it("só aparecem (e só são listados) com acesso", () => {
    const semAcesso = { showRestricted: false };
    const comContas = { showRestricted: false, paineisDoSetor: new Set(["painel-contas" as const]) };
    expect(visibleWidgets("paineis", DEFAULT_HOME_WIDGETS, semAcesso)).toEqual(["painel-tarefas"]);
    expect(visibleWidgets("paineis", DEFAULT_HOME_WIDGETS, comContas)).toEqual(["painel-tarefas", "painel-contas"]);
    expect(widgetsDisponiveis(semAcesso)).not.toContain("painel-dp");
    expect(widgetsDisponiveis(semAcesso)).not.toContain("workspace");
  });
});
