import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { empilharCamada } from "./camadas";

// A pilha do Esc (auditoria de UX, 30/10/2026): o Esc num calendário aberto
// dentro de um modal fechava o modal inteiro. Sem navegador, um `document` de
// mentira que guarda o ouvinte — o que importa é quem a pilha fecha.

type Ouvinte = (e: KeyboardEvent) => void;
let ouvintes: Ouvinte[] = [];

beforeEach(() => {
  ouvintes = [];
  vi.stubGlobal("document", {
    addEventListener: (_tipo: string, f: Ouvinte) => ouvintes.push(f),
    removeEventListener: (_tipo: string, f: Ouvinte) => {
      ouvintes = ouvintes.filter((o) => o !== f);
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function tecla(key: string, jaTratada = false) {
  const e = { key, defaultPrevented: jaTratada, preventDefault: vi.fn() };
  for (const o of ouvintes) o(e as unknown as KeyboardEvent);
  return e;
}

describe("pilha de camadas do Esc", () => {
  it("fecha só a camada de cima — o calendário, não o modal embaixo dele", () => {
    const modal = vi.fn();
    const calendario = vi.fn();
    const tirarModal = empilharCamada(modal);
    const tirarCalendario = empilharCamada(calendario);

    const e = tecla("Escape");
    expect(calendario).toHaveBeenCalledOnce();
    expect(modal).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();

    tirarCalendario();
    tecla("Escape");
    expect(modal).toHaveBeenCalledOnce();
    tirarModal();
  });

  it("não fecha nada quando um componente já tratou o Esc (a lista aberta de um combobox)", () => {
    const modal = vi.fn();
    const tirar = empilharCamada(modal);
    tecla("Escape", true);
    expect(modal).not.toHaveBeenCalled();
    tirar();
  });

  it("ignora as outras teclas", () => {
    const modal = vi.fn();
    const tirar = empilharCamada(modal);
    tecla("Enter");
    expect(modal).not.toHaveBeenCalled();
    tirar();
  });

  it("um ouvinte só enquanto há camada, e nenhum depois que a última sai", () => {
    const tirarA = empilharCamada(vi.fn());
    const tirarB = empilharCamada(vi.fn());
    expect(ouvintes).toHaveLength(1);
    tirarA();
    expect(ouvintes).toHaveLength(1);
    tirarB();
    expect(ouvintes).toHaveLength(0);
  });

  it("tirar uma camada do meio não muda quem está no topo", () => {
    const baixo = vi.fn();
    const meio = vi.fn();
    const topo = vi.fn();
    const tirarBaixo = empilharCamada(baixo);
    const tirarMeio = empilharCamada(meio);
    const tirarTopo = empilharCamada(topo);
    tirarMeio();
    tecla("Escape");
    expect(topo).toHaveBeenCalledOnce();
    expect(meio).not.toHaveBeenCalled();
    expect(baixo).not.toHaveBeenCalled();
    tirarTopo();
    tirarBaixo();
  });
});
