import { describe, expect, it } from "vitest";
import { criarCenario, documentosDoContexto, executarAcao, precisaRevisar, type AcaoFiscal, type Cenario } from "./cenario";
import { fluxoDaCompetencia, ultimasVersoesDoContexto } from "./fluxo";

const modulos = ["fiscal_acervo", "fiscal_classificacao", "fiscal_contribuicoes", "fiscal_entregas"];
function agir(cenario: Cenario, acao: AcaoFiscal) {
  return executarAcao(cenario, acao, cenario.contexto, "2026-10-13T12:00:00Z", `teste-${cenario.atividades.length}`).cenario;
}
function proxima(cenario: Cenario) { return fluxoDaCompetencia(cenario, modulos).find((e) => !e.completa); }
function preparar() {
  let cenario = criarCenario();
  for (const d of documentosDoContexto(cenario).filter((d) => d.estado === "Rejeitado")) cenario = agir(cenario, { tipo: "recuperar", id: d.id });
  cenario = agir(cenario, { tipo: "classificar", ids: documentosDoContexto(cenario).map((d) => d.id), destino: "Revenda", credito: true, cst: "00" });
  cenario = agir(cenario, { tipo: "apurar" });
  return agir(cenario, { tipo: "fechar" });
}

describe("próxima ação do fluxo fiscal", () => {
  it("uma versão nova de todos os estabelecimentos substitui as versões individuais antigas", () => {
    let cenario = preparar();
    cenario = agir(cenario, { tipo: "gerar", imposto: "ICMS/IPI" });
    cenario = agir(cenario, { tipo: "classificar", ids: [documentosDoContexto(cenario)[0].id], destino: "Uso e consumo", credito: false, cst: "90" });
    cenario.contexto.estabelecimentoId = "";
    cenario = executarAcao(cenario, { tipo: "gerar", imposto: "ICMS/IPI" }, cenario.contexto, "2026-10-14T12:00:00Z", "todos-novo").cenario;
    const atuais = ultimasVersoesDoContexto(cenario).filter((a) => a.tipo === "ICMS/IPI");
    expect(atuais.map((a) => a.id)).toEqual(["todos-novo"]);
    expect(atuais.some((a) => precisaRevisar(cenario, a))).toBe(false);
    cenario.contexto.estabelecimentoId = "aurora-pr";
    expect(ultimasVersoesDoContexto(cenario).filter((a) => a.tipo === "ICMS/IPI").map((a) => a.id)).toEqual(["todos-novo"]);
  });
  it("orienta cada etapa, da quarentena à entrega", () => {
    let cenario = criarCenario();
    expect(proxima(cenario)?.aba).toBe("quarentena");
    cenario = agir(cenario, { tipo: "recuperar", id: documentosDoContexto(cenario).find((d) => d.estado === "Rejeitado")!.id });
    expect(proxima(cenario)?.titulo).toBe("Classificar");
    cenario = agir(cenario, { tipo: "classificar", ids: documentosDoContexto(cenario).map((d) => d.id), destino: "Revenda", credito: true, cst: "00" });
    expect(proxima(cenario)?.titulo).toBe("Apurar e fechar");
    cenario = agir(cenario, { tipo: "apurar" });
    expect(proxima(cenario)?.titulo).toBe("Apurar e fechar");
    cenario = agir(cenario, { tipo: "fechar" });
    expect(proxima(cenario)?.titulo).toBe("Gerar arquivos");
    cenario = agir(cenario, { tipo: "gerar", imposto: "Contribuições" });
    expect(proxima(cenario)?.titulo).toBe("Gerar arquivos");
    cenario = agir(cenario, { tipo: "gerar", imposto: "ICMS/IPI" });
    expect(proxima(cenario)?.titulo).toBe("Validar");
    for (const arquivo of ultimasVersoesDoContexto(cenario)) cenario = agir(cenario, { tipo: "validar", id: arquivo.id });
    expect(proxima(cenario)?.titulo).toBe("Registrar entrega");
    for (const arquivo of ultimasVersoesDoContexto(cenario)) cenario = agir(cenario, { tipo: "entregar", id: arquivo.id });
    expect(proxima(cenario)).toBeUndefined();
  });

  it("não usa a entrega antiga para dar uma nova versão como concluída", () => {
    let cenario = agir(preparar(), { tipo: "gerar", imposto: "Contribuições" });
    cenario = agir(cenario, { tipo: "gerar", imposto: "ICMS/IPI" });
    for (const arquivo of ultimasVersoesDoContexto(cenario)) {
      cenario = agir(cenario, { tipo: "validar", id: arquivo.id });
      cenario = agir(cenario, { tipo: "entregar", id: arquivo.id });
    }
    cenario = agir(cenario, { tipo: "gerar", imposto: "Contribuições" });
    expect(proxima(cenario)?.titulo).toBe("Validar");
    cenario = agir(cenario, { tipo: "classificar", ids: [documentosDoContexto(cenario)[0].id], destino: "Uso e consumo", credito: false, cst: "90" });
    expect(proxima(cenario)?.titulo).toBe("Apurar e fechar");
  });

  it("não conclui um recorte vazio e respeita a área de apuração disponível", () => {
    const cenario = criarCenario();
    cenario.documentos = [];
    cenario.periodos = [];
    cenario.arquivos = [];
    expect(fluxoDaCompetencia(cenario, ["fiscal_icms_ipi"]).every((e) => !e.completa)).toBe(true);
    expect(fluxoDaCompetencia(cenario, ["fiscal_icms_ipi"])[2].modulo).toBe("fiscal_icms_ipi");
  });
});
