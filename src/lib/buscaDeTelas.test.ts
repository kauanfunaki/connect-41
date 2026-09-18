import { describe, expect, it } from "vitest";
import { buscarTelas, type TelaNavegavel } from "./buscaDeTelas";

const telas: TelaNavegavel[] = [
  { code: "bpo_conciliacao", label: "Conciliação bancária", href: "/conciliacao", setor: "BPO" },
  { code: "bpo_cobranca", label: "Cobrança", href: "/cobranca", setor: "BPO" },
  { code: "bpo_contas_pagar", label: "Contas a pagar", href: "/pagar", setor: "BPO" },
  { code: "societario_relatorios", label: "Relatórios", href: "/societario/relatorios", setor: "Societário" },
];

describe("buscarTelas", () => {
  it("acha sem acento e no meio do nome", () => {
    expect(buscarTelas(telas, "concilia").map((t) => t.code)).toEqual(["bpo_conciliacao"]);
    expect(buscarTelas(telas, "bancaria").map((t) => t.code)).toEqual(["bpo_conciliacao"]);
    expect(buscarTelas(telas, "COBRAN").map((t) => t.code)).toEqual(["bpo_cobranca"]);
  });

  it("quem começa com o termo vem antes de quem só contém", () => {
    expect(buscarTelas(telas, "co").map((t) => t.code)).toEqual([
      "bpo_conciliacao",
      "bpo_cobranca",
      "bpo_contas_pagar",
    ]);
  });

  it("o setor casa por último, e não atropela o nome da tela", () => {
    const achados = buscarTelas(telas, "societario").map((t) => t.code);
    expect(achados).toEqual(["societario_relatorios"]);
    const porNome = buscarTelas(telas, "relat").map((t) => t.code);
    expect(porNome).toEqual(["societario_relatorios"]);
  });

  it("termo curto demais não busca, e o limite é respeitado", () => {
    expect(buscarTelas(telas, "c")).toEqual([]);
    expect(buscarTelas(telas, "  ")).toEqual([]);
    expect(buscarTelas(telas, "co", 2)).toHaveLength(2);
  });
});
