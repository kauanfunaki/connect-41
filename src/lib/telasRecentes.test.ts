import { describe, expect, it } from "vitest";
import {
  lerTelasRecentes,
  registrarTelaRecente,
  moduloDaRota,
  LIMITE_DE_TELAS_RECENTES,
} from "./telasRecentes";

describe("lerTelasRecentes", () => {
  it("lê a lista guardada e ignora o que não é módulo conhecido", () => {
    expect(lerTelasRecentes(JSON.stringify(["bpo_conciliacao", "nao_existe", "bpo_conciliacao"]))).toEqual([
      "bpo_conciliacao",
    ]);
  });

  it("storage vazio, sujo ou de outro formato devolve lista vazia", () => {
    expect(lerTelasRecentes(null)).toEqual([]);
    expect(lerTelasRecentes("{[não é json")).toEqual([]);
    expect(lerTelasRecentes(JSON.stringify({ code: "bpo_conciliacao" }))).toEqual([]);
  });
});

describe("registrarTelaRecente", () => {
  it("a visitada vai para o topo, sem repetir", () => {
    const depois = registrarTelaRecente(["bpo_contas_pagar", "bpo_conciliacao"], "bpo_conciliacao");
    expect(depois).toEqual(["bpo_conciliacao", "bpo_contas_pagar"]);
  });

  it("passando do teto, a mais antiga cai", () => {
    const cheio = ["bpo_contas_pagar", "bpo_contas_receber", "bpo_lancamentos", "bpo_cobranca", "bpo_fluxo_caixa"];
    expect(cheio).toHaveLength(LIMITE_DE_TELAS_RECENTES);
    const depois = registrarTelaRecente(cheio, "bpo_conciliacao");
    expect(depois).toHaveLength(LIMITE_DE_TELAS_RECENTES);
    expect(depois[0]).toBe("bpo_conciliacao");
    expect(depois).not.toContain("bpo_fluxo_caixa");
  });

  it("tela desconhecida não entra", () => {
    expect(registrarTelaRecente(["bpo_conciliacao"], "nao_existe")).toEqual(["bpo_conciliacao"]);
  });
});

describe("moduloDaRota", () => {
  it("acha o módulo da rota, inclusive dentro da ficha", () => {
    expect(moduloDaRota("/conciliacao")).toBe("bpo_conciliacao");
    expect(moduloDaRota("/pendencias/abc-123")).toBe("bpo_pendencias");
  });

  // `/dre` é a DRE de caixa e `/dre/economica` é outro módulo: por igualdade,
  // a econômica não seria reconhecida; pelo prefixo curto, seria a errada.
  it("o maior prefixo ganha", () => {
    expect(moduloDaRota("/dre")).toBe("bpo_dre");
    expect(moduloDaRota("/dre/economica")).toBe("dre_economica");
    expect(moduloDaRota("/dre/orcamento")).toBe("dre_orcamento");
  });

  it("rota que não é de módulo devolve nulo", () => {
    expect(moduloDaRota("/home")).toBeNull();
    expect(moduloDaRota("/empresas/1")).toBeNull();
    expect(moduloDaRota("/pagarmentos")).toBeNull();
  });
});
