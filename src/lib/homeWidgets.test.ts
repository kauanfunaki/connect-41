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

describe("faixa de destaques (06/10)", () => {
  it("nasce visível, por último no topo — colada nos painéis — inclusive para quem já personalizou", () => {
    const opts = { showRestricted: false };
    expect(visibleWidgets("top", DEFAULT_HOME_WIDGETS, opts)).toEqual(["proxima-reuniao", "destaques"]);
    const antiga = parseHomeWidgets(serializeHomeWidgets(["proxima-reuniao", "indicadores", "meu-dia"], ["agenda"]));
    expect(visibleWidgets("top", antiga, opts)).toEqual(["proxima-reuniao", "destaques"]);
  });

  it("pode ser ocultada como qualquer bloco", () => {
    const raw = serializeHomeWidgets(["indicadores"], ["destaques"]);
    expect(visibleWidgets("top", parseHomeWidgets(raw), { showRestricted: false })).not.toContain("destaques");
  });
});

describe("indicadores abaixo dos painéis (08/10, escolha 7A)", () => {
  const opts = { showRestricted: false };

  it("saem do topo e vêm depois dos painéis, no padrão", () => {
    expect(visibleWidgets("top", DEFAULT_HOME_WIDGETS, opts)).not.toContain("indicadores");
    expect(visibleWidgets("abaixo-dos-paineis", DEFAULT_HOME_WIDGETS, opts)).toEqual(["indicadores"]);
  });

  it("a preferência gravada continua valendo: visível desce junto, oculto segue oculto", () => {
    // Formato antigo (só a lista dos visíveis, até 30/09), com os Indicadores primeiro.
    const antigaComIndicadores = parseHomeWidgets(JSON.stringify(["indicadores", "proxima-reuniao", "meu-dia", "agenda"]));
    expect(visibleWidgets("abaixo-dos-paineis", antigaComIndicadores, opts)).toEqual(["indicadores"]);
    expect(visibleWidgets("top", antigaComIndicadores, opts)).toEqual(["proxima-reuniao", "destaques"]);
    expect(visibleWidgets("main", antigaComIndicadores, opts)).toEqual(["meu-dia"]);

    const antigaSemIndicadores = parseHomeWidgets(JSON.stringify(["proxima-reuniao", "meu-dia"]));
    expect(visibleWidgets("abaixo-dos-paineis", antigaSemIndicadores, opts)).toEqual([]);

    // Formato novo: a ordem de cada faixa é a salva; o oculto não volta.
    const nova = parseHomeWidgets(serializeHomeWidgets(["destaques", "indicadores", "agenda", "atividade"], ["proxima-reuniao"]));
    expect(visibleWidgets("top", nova, opts)).toEqual(["destaques"]);
    expect(visibleWidgets("abaixo-dos-paineis", nova, opts)).toEqual(["indicadores"]);
    expect(visibleWidgets("side", nova, opts).slice(0, 2)).toEqual(["agenda", "atividade"]);
    const ocultos = parseHomeWidgets(serializeHomeWidgets(["destaques"], ["indicadores"]));
    expect(visibleWidgets("abaixo-dos-paineis", ocultos, opts)).toEqual([]);
  });

  it("continuam na lista do Personalizar, para quem quiser ligar ou desligar", () => {
    expect(widgetsDisponiveis(opts)).toContain("indicadores");
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
