import { describe, expect, it } from "vitest";
import { avaliarFixar, telasFixadasVisiveis, LIMITE_DE_TELAS_FIXADAS } from "./telasFixadas";

describe("avaliarFixar", () => {
  it("fixa o que não está fixado, e solta o que está", () => {
    expect(avaliarFixar([], "bpo_conciliacao")).toEqual({ ok: true, fixar: true });
    expect(avaliarFixar(["bpo_conciliacao"], "bpo_conciliacao")).toEqual({ ok: true, fixar: false });
  });

  it("recusa código que não é módulo do catálogo", () => {
    expect(avaliarFixar([], "tela_que_nao_existe")).toEqual({ ok: false, erro: "Tela desconhecida." });
  });

  it("no teto, fixar outra é recusado — mas soltar continua valendo", () => {
    const cheio = ["bpo_contas_pagar", "bpo_contas_receber", "bpo_lancamentos", "bpo_cobranca", "bpo_conciliacao", "bpo_fluxo_caixa"];
    expect(cheio).toHaveLength(LIMITE_DE_TELAS_FIXADAS);
    const veredito = avaliarFixar(cheio, "bpo_pendencias");
    expect(veredito.ok).toBe(false);
    expect(avaliarFixar(cheio, "bpo_conciliacao")).toEqual({ ok: true, fixar: false });
  });
});

describe("telasFixadasVisiveis", () => {
  const disponiveis = [
    { code: "bpo_conciliacao", label: "Conciliação bancária" },
    { code: "bpo_contas_pagar", label: "Contas a pagar" },
  ];

  it("respeita a ordem escolhida, não a ordem do catálogo", () => {
    const telas = telasFixadasVisiveis(["bpo_contas_pagar", "bpo_conciliacao"], disponiveis);
    expect(telas.map((t) => t.code)).toEqual(["bpo_contas_pagar", "bpo_conciliacao"]);
  });

  // Módulo desligado no tenant, transferido de setor ou fora do alcance da
  // pessoa não pode virar link quebrado na sidebar — some da lista e continua
  // guardado, para voltar se for religado.
  it("some com o que a pessoa não pode abrir agora, e não duplica", () => {
    expect(telasFixadasVisiveis(["dre_orcamento"], disponiveis)).toEqual([]);
    const telas = telasFixadasVisiveis(["bpo_conciliacao", "bpo_conciliacao", "dre_orcamento"], disponiveis);
    expect(telas.map((t) => t.code)).toEqual(["bpo_conciliacao"]);
  });
});
