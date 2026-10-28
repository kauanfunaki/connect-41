import { describe, expect, it } from "vitest";
import { telasDaArea, type ModuloParaArea } from "./telasDaArea";

const m = (code: string, sectorCodes: string[], enabled = true): ModuloParaArea => ({ code, label: code, description: "", enabled, sectorCodes });

describe("telasDaArea", () => {
  const modulos = [
    m("bpo_contas_pagar", ["bpo"]),
    m("bpo_pendencias", ["bpo"]),
    m("portal_solicitacoes", ["controladoria"]),
    m("bpo_comunicacao", ["bpo"], false),
    m("comercial_leads", ["comercial", "bpo"]),
    m("dp_colaboradores", ["dp"]),
  ];

  it("só as telas ligadas da área, com o Geral primeiro", () => {
    const blocos = telasDaArea("atendimento", modulos, () => true);
    expect(blocos.map((b) => b.setor)).toEqual([null, "bpo", "comercial"]);
    expect(blocos[0].telas.map((t) => t.href)).toEqual(["/solicitacoes"]);
    expect(blocos[1].telas.map((t) => t.code)).toEqual(["bpo_pendencias"]);
  });

  it("fica de fora o setor que a pessoa não vê; a tela de dois setores cai no que ela vê", () => {
    const blocos = telasDaArea("atendimento", modulos, (s) => s === "bpo");
    expect(blocos.map((b) => b.setor)).toEqual([null, "bpo"]);
    expect(blocos[1].telas.map((t) => t.href)).toEqual(["/setor/bpo/bpo_pendencias", "/setor/bpo/comercial_leads"]);
  });

  it("área sem tela para a pessoa é lista vazia", () => {
    expect(telasDaArea("pessoas", modulos, (s) => s === "bpo")).toEqual([]);
  });
});
