import { describe, expect, it } from "vitest";
import { mensagemDoEmailRepetido, saidaParaOEmailRepetido, type AcessoExistente } from "./acessoExistente";

// O caso que motivou (13/10/2026): o e-mail da IRRIGA FOUR já era de um acesso
// desativado, de outro cliente, e a tela só dizia "Já existe um acesso".
const desativadoDeOutro: AcessoExistente = {
  id: "pu-1",
  nome: "Maria",
  email: "maria@exemplo.com",
  ativo: false,
  clienteId: "g-antigo",
  cliente: "Cliente Antigo",
};
const irriga = { id: "g-irriga", nome: "IRRIGA FOUR" };

describe("mensagemDoEmailRepetido", () => {
  it("diz que está desativado e de qual cliente é", () => {
    const m = mensagemDoEmailRepetido(desativadoDeOutro, irriga.id);
    expect(m).toContain("desativado");
    expect(m).toContain("Cliente Antigo");
    expect(m).toContain("Maria");
  });

  it("ativo no mesmo cliente: diz que não precisa criar outro", () => {
    const m = mensagemDoEmailRepetido({ ...desativadoDeOutro, ativo: true, clienteId: irriga.id }, irriga.id);
    expect(m).toContain("ativo neste cliente");
    expect(m).toContain("Enviar link");
  });
});

describe("saidaParaOEmailRepetido", () => {
  it("desativado de outro cliente: reativar e passar para o cliente escolhido", () => {
    expect(saidaParaOEmailRepetido(desativadoDeOutro, irriga)?.botao).toBe("Reativar e passar para o cliente IRRIGA FOUR");
  });

  it("desativado no mesmo cliente: só reativar", () => {
    expect(saidaParaOEmailRepetido({ ...desativadoDeOutro, clienteId: irriga.id }, irriga)?.botao).toBe("Reativar este acesso");
  });

  it("ativo em outro cliente: passar para o escolhido", () => {
    const s = saidaParaOEmailRepetido({ ...desativadoDeOutro, ativo: true }, irriga);
    expect(s?.botao).toBe("Passar para o cliente IRRIGA FOUR");
    expect(s?.explicacao).toContain("entrar de novo");
  });

  it("ativo no mesmo cliente, ou sem cliente escolhido: nada a oferecer", () => {
    expect(saidaParaOEmailRepetido({ ...desativadoDeOutro, ativo: true, clienteId: irriga.id }, irriga)).toBeNull();
    expect(saidaParaOEmailRepetido(desativadoDeOutro, null)).toBeNull();
  });
});
