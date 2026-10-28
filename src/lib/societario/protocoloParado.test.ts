import { describe, expect, it } from "vitest";
import { chaveDoProtocoloParado, lerDiasDaCobranca, mensagemDoProtocoloParado, protocoloParado, rotuloDaCobranca } from "./protocoloParado";

// O protocolo parado no órgão (lote 5, 28/10/2026): quando avisa, quantas
// vezes, e o que a tela aceita.

const PROTOCOLADO = new Date("2026-10-01T15:00:00Z");
const dia = (n: number) => new Date(PROTOCOLADO.getTime() + n * 24 * 60 * 60 * 1000);

describe("o protocolo parado", () => {
  it("avisa aos N dias, e de novo a cada N dias: cada volta é uma chave", () => {
    expect(protocoloParado(PROTOCOLADO, dia(14), 15)).toBeNull();
    expect(protocoloParado(PROTOCOLADO, dia(15), 15)).toEqual({ diasParado: 15, volta: 1 });
    expect(protocoloParado(PROTOCOLADO, dia(29), 15)).toEqual({ diasParado: 29, volta: 1 });
    expect(protocoloParado(PROTOCOLADO, dia(30), 15)).toEqual({ diasParado: 30, volta: 2 });
    expect(chaveDoProtocoloParado("p1", 2)).toBe("protocolo-parado:p1:2");
  });

  it("0 desliga", () => {
    expect(protocoloParado(PROTOCOLADO, dia(400), 0)).toBeNull();
  });

  it("a tela só aceita as opções", () => {
    expect([lerDiasDaCobranca("15"), lerDiasDaCobranca(0), lerDiasDaCobranca("0"), lerDiasDaCobranca("16"), lerDiasDaCobranca("x"), lerDiasDaCobranca(null)]).toEqual([15, 0, 0, null, null, null]);
    expect([rotuloDaCobranca(0), rotuloDaCobranca(20)]).toEqual(["Não avisar", "20 dias sem resposta"]);
  });

  it("a mensagem diz o órgão, a empresa, o processo e quantos dias", () => {
    expect(mensagemDoProtocoloParado({ orgao: "LISA", empresa: "Empresa Fictícia", processo: "Alvará", diasParado: 16 })).toBe(
      "Protocolo sem resposta há 16 dias em LISA: Empresa Fictícia — Alvará. Hora de cobrar o órgão."
    );
  });
});
