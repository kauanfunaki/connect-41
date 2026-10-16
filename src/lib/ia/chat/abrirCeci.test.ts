import { describe, expect, it, vi } from "vitest";
import { EVENTO_ABRIR_CECI, assinarPedidosParaAbrirCeci, lerPedidoParaAbrirCeci, pedirParaAbrirCeci } from "./abrirCeci";

describe("abrir a Ceci por um botão da tela", () => {
  it("o pedido chega a quem escuta, com o agente e o assunto", () => {
    const janela = new EventTarget();
    const aoPedir = vi.fn();
    const parar = assinarPedidosParaAbrirCeci(aoPedir, janela);
    pedirParaAbrirCeci({ agente: "assistente_do_recrutamento", assunto: "a vaga Auxiliar de produção" }, janela);
    expect(aoPedir).toHaveBeenCalledWith({ agente: "assistente_do_recrutamento", assunto: "a vaga Auxiliar de produção" });

    // Parar de escutar (o retorno do `useEffect`) desliga.
    parar();
    pedirParaAbrirCeci({ agente: "assistente_do_recrutamento" }, janela);
    expect(aoPedir).toHaveBeenCalledTimes(1);
  });

  it("o nome do evento é o combinado com o chat", () => {
    const janela = new EventTarget();
    const ouvido = vi.fn();
    janela.addEventListener(EVENTO_ABRIR_CECI, ouvido);
    pedirParaAbrirCeci({}, janela);
    expect(EVENTO_ABRIR_CECI).toBe("c41:abrir-ceci");
    expect(ouvido).toHaveBeenCalledTimes(1);
  });

  it("evento de outra origem é conferido: só texto curto passa", () => {
    expect(lerPedidoParaAbrirCeci(new Event(EVENTO_ABRIR_CECI))).toEqual({});
    expect(lerPedidoParaAbrirCeci(new CustomEvent(EVENTO_ABRIR_CECI, { detail: "texto solto" }))).toEqual({});
    expect(lerPedidoParaAbrirCeci(new CustomEvent(EVENTO_ABRIR_CECI, { detail: { agente: 42, assunto: "  " } }))).toEqual({});
    const longo = lerPedidoParaAbrirCeci(new CustomEvent(EVENTO_ABRIR_CECI, { detail: { assunto: "a".repeat(500) } }));
    expect(longo.assunto).toHaveLength(160);
  });
});
