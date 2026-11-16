import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TASK_WIDGETS } from "@/lib/taskWidgets";
import { PainelDoMeuDia, type AlvoDoMeuDia } from "./ConfigurarTarefasButton";

const EU: AlvoDoMeuDia = { tipo: "pessoa", id: "u1", rotulo: "Você", eu: true, blocos: ["processos", "reunioes"], proprio: false };
const COLEGA: AlvoDoMeuDia = { tipo: "pessoa", id: "u2", rotulo: "Pessoa da equipe", eu: false, blocos: ["processos"], proprio: true };
const SETOR: AlvoDoMeuDia = { tipo: "setor", code: "fiscal", rotulo: "Setor de exemplo", blocos: ["processos"] };

function painel(alvos: AlvoDoMeuDia[], alvo: AlvoDoMeuDia, extras: { restaurando?: boolean } = {}): string {
  return renderToStaticMarkup(
    h(PainelDoMeuDia, {
      alvos,
      alvo,
      blocos: alvo.blocos,
      restaurando: extras.restaurando ?? false,
      onEscolher: () => {},
      onTrocar: () => {},
      onRestaurar: () => {},
    })
  );
}

/** Os interruptores, na ordem da tela: o nome e se está ligado. */
function interruptores(markup: string): { nome: string; ligado: boolean }[] {
  return Array.from(markup.matchAll(/<button[^>]*role="switch"[^>]*aria-checked="(true|false)"[^>]*>[\s\S]*?<\/button>/g)).map((m) => ({
    nome: m[0].replace(/<[^>]+>/g, ""),
    ligado: m[1] === "true",
  }));
}

/** O botão do pé (a volta ao padrão): o único que não é interruptor nem o seletor. */
function botaoDoPe(markup: string): string {
  return Array.from(markup.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g))
    .map((m) => m[0])
    .filter((b) => !/role="(switch|combobox)"/.test(b))
    .at(-1)!;
}

describe("painel do Configurar do Meu dia", () => {
  it("um interruptor por bloco do catálogo, na ordem dos grupos, ligado conforme o alvo", () => {
    const markup = painel([EU], EU);
    const naOrdem = [...TASK_WIDGETS.filter((w) => w.grupo === "origem"), ...TASK_WIDGETS.filter((w) => w.grupo === "bloco")];
    expect(interruptores(markup)).toEqual(naOrdem.map((w) => ({ nome: w.label, ligado: EU.blocos.includes(w.key) })));
    expect(markup).toMatch(/role="group" aria-label="Nas listas"/);
    expect(markup).toMatch(/role="group" aria-label="Ao lado"/);
  });

  it("“Para quem” só aparece com mais de um alvo", () => {
    expect(painel([EU], EU)).not.toMatch(/Para quem/);
    const comEquipe = painel([EU, COLEGA, SETOR], EU);
    expect(comEquipe).toMatch(/role="combobox"[^>]*aria-label="Para quem"/);
    expect(comEquipe).toMatch(/<optgroup label="Equipe">/);
    expect(comEquipe).toMatch(/<optgroup label="Padrão do setor">/);
  });

  it("no pé, a volta ao padrão: desabilitada para a pessoa que já está no padrão do setor", () => {
    expect(botaoDoPe(painel([EU], EU))).toMatch(/disabled=""[^>]*>[\s\S]*Voltar ao padrão do setor/);
    const comProprio = botaoDoPe(painel([EU, COLEGA], COLEGA));
    expect(comProprio).toMatch(/Voltar ao padrão do setor/);
    expect(comProprio).not.toMatch(/disabled=""/);
  });

  it("no padrão de um setor, a ação é “Restaurar padrão”", () => {
    const pe = botaoDoPe(painel([EU, SETOR], SETOR));
    expect(pe).toMatch(/Restaurar padrão/);
    expect(pe).not.toMatch(/disabled=""/);
  });

  it("enquanto volta ao padrão, os interruptores e a própria ação ficam travados", () => {
    const markup = painel([EU, COLEGA], COLEGA, { restaurando: true });
    expect(markup.match(/role="switch"[^>]*disabled=""/g)).toHaveLength(TASK_WIDGETS.length);
    expect(botaoDoPe(markup)).toMatch(/disabled=""/);
  });

  it("não tem mais Concluir, Cancelar nem o título e a frase da faixa (melhoria-714)", () => {
    const markup = painel([EU, COLEGA, SETOR], EU);
    for (const texto of ["Concluir", "Cancelar", "Configurando o Meu dia", "Só para você"]) expect(markup).not.toContain(texto);
  });
});
