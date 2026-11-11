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
    const raw = serializeHomeWidgets(["meu-dia", "painel-contas"], ["painel-tarefas"]);
    const lidos = parseHomeWidgets(raw);
    expect(lidos.slice(0, 2)).toEqual(["meu-dia", "painel-contas"]);
    expect(lidos).not.toContain("painel-tarefas");
    expect(lidos).not.toContain("indicadores");
    expect(lidos).toContain("agenda");
  });
});

// Os cartões coringa (10/11/2026, pedido do Kauan) tiraram do catálogo a faixa
// "Destaques" e os "Indicadores". Quem já tinha personalizado guardou as duas
// chaves — visíveis ou ocultas, no formato antigo ou no novo — e o layout dele
// tem de continuar de pé, só sem elas.
describe("chaves que saíram do catálogo (destaques e indicadores, 10/11/2026)", () => {
  const opts = { showRestricted: false };

  it("somem da lista do Personalizar e do topo", () => {
    expect(widgetsDisponiveis(opts)).not.toContain("destaques");
    expect(widgetsDisponiveis(opts)).not.toContain("indicadores");
    expect(visibleWidgets("top", DEFAULT_HOME_WIDGETS, opts)).toEqual(["proxima-reuniao"]);
  });

  it("formato antigo com os Indicadores primeiro: o resto continua na ordem salva", () => {
    const antiga = parseHomeWidgets(JSON.stringify(["indicadores", "proxima-reuniao", "meu-dia", "agenda"]));
    expect(antiga).not.toContain("indicadores");
    expect(visibleWidgets("top", antiga, opts)).toEqual(["proxima-reuniao"]);
    expect(visibleWidgets("main", antiga, opts)).toEqual(["meu-dia"]);
    expect(visibleWidgets("side", antiga, opts)[0]).toBe("agenda");
  });

  it("formato novo com as duas visíveis ou ocultas: a ordem e os ocultos dos outros blocos valem", () => {
    // Como foi gravado antes de 10/11/2026 (`serializeHomeWidgets` já não aceita as duas chaves).
    const nova = parseHomeWidgets(JSON.stringify({ visiveis: ["destaques", "indicadores", "agenda", "atividade"], ocultos: ["proxima-reuniao"] }));
    expect(nova).not.toContain("destaques");
    expect(nova).not.toContain("indicadores");
    expect(visibleWidgets("top", nova, opts)).toEqual([]);
    expect(visibleWidgets("side", nova, opts).slice(0, 2)).toEqual(["agenda", "atividade"]);

    // Gravado direto, sem passar por `serializeHomeWidgets` (que já descarta).
    const cru = parseHomeWidgets(JSON.stringify({ visiveis: ["meu-dia", "destaques"], ocultos: ["indicadores", "agenda"] }));
    expect(cru[0]).toBe("meu-dia");
    expect(cru).not.toContain("agenda");
    expect(cru).not.toContain("destaques");
  });
});

// melhoria-597 (11/11/2026): com "Usa reuniões" desligado em todos os setores da
// pessoa, "Próxima reunião" e "Agenda" nascem desligados no Início.
describe("setor que não usa reuniões", () => {
  const opts = { showRestricted: false };

  it("sem preferência, os blocos de reunião não aparecem", () => {
    const lidos = parseHomeWidgets(null, false);
    expect(lidos).not.toContain("proxima-reuniao");
    expect(lidos).not.toContain("agenda");
    expect(lidos).toContain("meu-dia");
    expect(visibleWidgets("top", lidos, opts)).toEqual([]);
  });

  it("preferência gravada antes (formato antigo ou sem versão): segue o setor", () => {
    const antiga = parseHomeWidgets(JSON.stringify(["agenda", "meu-dia", "proxima-reuniao"]), false);
    expect(antiga).toEqual(expect.not.arrayContaining(["agenda", "proxima-reuniao"]));
    expect(antiga[0]).toBe("meu-dia");
    const semVersao = parseHomeWidgets(JSON.stringify({ visiveis: ["agenda", "meu-dia"], ocultos: [] }), false);
    expect(semVersao).not.toContain("agenda");
  });

  it("ligado pela pessoa no Personalizar (versão 2): vale", () => {
    const raw = serializeHomeWidgets(["agenda", "meu-dia"], ["proxima-reuniao"]);
    const lidos = parseHomeWidgets(raw, false);
    expect(lidos.slice(0, 2)).toEqual(["agenda", "meu-dia"]);
    expect(lidos).not.toContain("proxima-reuniao");
  });

  it("quem usa reuniões continua vendo tudo", () => {
    expect(parseHomeWidgets(null, true)).toEqual(DEFAULT_HOME_WIDGETS);
    expect(parseHomeWidgets(JSON.stringify(["agenda", "meu-dia"]), true)[0]).toBe("agenda");
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
