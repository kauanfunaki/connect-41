import { describe, expect, it } from "vitest";
import { listaDeNomes, mensagemDoEmailRepetido, saidaParaOEmailRepetido, type AcessoExistente } from "./acessoExistente";

// O caso que motivou (13/10/2026): o e-mail da IRRIGA FOUR já era de um acesso
// desativado, de outra empresa, e a tela só dizia "Já existe um acesso". Desde
// 14/10/2026 o acesso é ligado direto às empresas.
const desativadoDeOutra: AcessoExistente = {
  id: "pu-1",
  nome: "Maria",
  email: "maria@exemplo.com",
  ativo: false,
  empresaIds: ["antiga"],
  empresas: ["Empresa Antiga"],
};
const irriga = { id: "irriga", nome: "IRRIGA FOUR" };

describe("mensagemDoEmailRepetido", () => {
  it("diz que está desativado, de quem é e o que via", () => {
    const m = mensagemDoEmailRepetido(desativadoDeOutra, [irriga]);
    expect(m).toContain("desativado");
    expect(m).toContain("Maria");
    expect(m).toContain("Empresa Antiga");
  });

  it("ativo e já vendo as escolhidas: diz que não precisa criar outro", () => {
    const m = mensagemDoEmailRepetido({ ...desativadoDeOutra, ativo: true, empresaIds: ["irriga"] }, [irriga]);
    expect(m).toContain("já vê esta empresa");
    expect(m).toContain("Enviar link");
  });

  it("sem empresa ligada: diz isso", () => {
    expect(mensagemDoEmailRepetido({ ...desativadoDeOutra, empresaIds: [], empresas: [] }, [irriga])).toContain("sem empresa ligada");
  });
});

describe("saidaParaOEmailRepetido", () => {
  it("desativado: reativar com SÓ as escolhidas — as antigas saem", () => {
    const s = saidaParaOEmailRepetido(desativadoDeOutra, [irriga]);
    expect(s?.botao).toBe("Reativar este acesso");
    expect(s?.explicacao).toContain("passa a ver só IRRIGA FOUR");
    expect(s?.explicacao).toContain("as empresas que ele tinha antes saem");
  });

  it("ativo noutra empresa: ligar a escolhida a ele, sem tirar o que já vê", () => {
    const s = saidaParaOEmailRepetido({ ...desativadoDeOutra, ativo: true }, [irriga]);
    expect(s?.botao).toBe("Ligar a empresa a este acesso");
    expect(s?.explicacao).toContain("continua vendo o que já via");
  });

  it("ativo: conta só as escolhidas que ele ainda não tem", () => {
    const s = saidaParaOEmailRepetido({ ...desativadoDeOutra, ativo: true, empresaIds: ["irriga"] }, [
      irriga,
      { id: "b", nome: "B" },
      { id: "c", nome: "C" },
    ]);
    expect(s?.botao).toBe("Ligar as 2 empresas a este acesso");
    expect(s?.explicacao).toContain("também B e C");
  });

  it("ativo já vendo todas, ou nenhuma empresa escolhida: nada a oferecer", () => {
    expect(saidaParaOEmailRepetido({ ...desativadoDeOutra, ativo: true, empresaIds: ["irriga"] }, [irriga])).toBeNull();
    expect(saidaParaOEmailRepetido(desativadoDeOutra, [])).toBeNull();
  });
});

describe("listaDeNomes", () => {
  it("junta com vírgula e “e”, e resume o que passa de três", () => {
    expect(listaDeNomes([])).toBe("");
    expect(listaDeNomes(["A"])).toBe("A");
    expect(listaDeNomes(["A", "B"])).toBe("A e B");
    expect(listaDeNomes(["A", "B", "C"])).toBe("A, B e C");
    expect(listaDeNomes(["A", "B", "C", "D", "E"])).toBe("A, B, C e mais 2");
  });
});
