import { describe, it, expect } from "vitest";
import { avaliarConexao, contarEsperandoRobo, type SinaisDaConexao } from "./saude";

const AGORA = new Date("2026-09-16T15:00:00Z");
const minutosAtras = (n: number) => new Date(AGORA.getTime() - n * 60_000);

function sinais(over: Partial<SinaisDaConexao> = {}): SinaisDaConexao {
  return {
    ligada: true,
    estado: { estado: "conectado", detalhe: null },
    ultimaFalha: null,
    esperandoRobo: 0,
    ...over,
  };
}

describe("avaliarConexao", () => {
  it("conectada e sem sinais ruins está ok", () => {
    expect(avaliarConexao(sinais(), AGORA)).toEqual({ nivel: "ok", titulo: "Conectado", motivos: [] });
  });

  it("número desconectado é problema, e diz o que fazer", () => {
    const s = avaliarConexao(sinais({ estado: { estado: "desconectado", detalhe: null } }), AGORA);
    expect(s.nivel).toBe("problema");
    expect(s.titulo).toBe("Número desconectado");
    expect(s.motivos[0]).toContain("QR");
  });

  it("provedor que não respondeu é problema, com o detalhe", () => {
    const s = avaliarConexao(sinais({ estado: { estado: "indisponivel", detalhe: "Evolution 401" } }), AGORA);
    expect(s.nivel).toBe("problema");
    expect(s.motivos[0]).toContain("Evolution 401");
  });

  it("reconectando é atenção", () => {
    expect(avaliarConexao(sinais({ estado: { estado: "conectando", detalhe: null } }), AGORA).nivel).toBe("atencao");
  });

  it("conexão desligada é problema mesmo com o número conectado", () => {
    expect(avaliarConexao(sinais({ ligada: false }), AGORA).titulo).toBe("Conexão desligada");
  });

  it("falha de envio recente é atenção; antiga não conta", () => {
    expect(avaliarConexao(sinais({ ultimaFalha: { em: minutosAtras(30), erro: "Evolution 404" } }), AGORA).nivel).toBe(
      "atencao"
    );
    expect(avaliarConexao(sinais({ ultimaFalha: { em: minutosAtras(60 * 5), erro: "x" } }), AGORA).nivel).toBe("ok");
  });

  it("candidato sem resposta do robô é atenção", () => {
    const s = avaliarConexao(sinais({ esperandoRobo: 2 }), AGORA);
    expect(s.nivel).toBe("atencao");
    expect(s.motivos[0]).toContain("2 conversas");
  });

  // Quem olha lê primeiro o que para o atendimento.
  it("o título é o do achado mais grave, e todos os motivos aparecem", () => {
    const s = avaliarConexao(
      sinais({ esperandoRobo: 1, estado: { estado: "desconectado", detalhe: null } }),
      AGORA
    );
    expect(s.titulo).toBe("Número desconectado");
    expect(s.motivos).toHaveLength(2);
  });

  it("provedor sem consulta de estado não vira alarme", () => {
    const s = avaliarConexao(sinais({ estado: null }), AGORA);
    expect(s.nivel).toBe("ok");
    expect(s.motivos[0]).toContain("não informa");
  });
});

describe("contarEsperandoRobo", () => {
  const base = { handoffAt: null, optedOutAt: null };

  it("conta entrada sem resposta há mais de 10 minutos", () => {
    expect(contarEsperandoRobo([{ ...base, ultimaEntradaEm: minutosAtras(15), ultimaSaidaEm: null }], AGORA)).toBe(1);
    expect(
      contarEsperandoRobo([{ ...base, ultimaEntradaEm: minutosAtras(15), ultimaSaidaEm: minutosAtras(20) }], AGORA)
    ).toBe(1);
  });

  it("não conta o que acabou de chegar nem o que já foi respondido", () => {
    expect(contarEsperandoRobo([{ ...base, ultimaEntradaEm: minutosAtras(2), ultimaSaidaEm: null }], AGORA)).toBe(0);
    expect(
      contarEsperandoRobo([{ ...base, ultimaEntradaEm: minutosAtras(15), ultimaSaidaEm: minutosAtras(14) }], AGORA)
    ).toBe(0);
  });

  // Transferida espera uma pessoa, não o robô; opt-out não espera ninguém.
  it("não conta conversa transferida nem com opt-out", () => {
    expect(
      contarEsperandoRobo(
        [
          { handoffAt: minutosAtras(30), optedOutAt: null, ultimaEntradaEm: minutosAtras(15), ultimaSaidaEm: null },
          { handoffAt: null, optedOutAt: minutosAtras(30), ultimaEntradaEm: minutosAtras(15), ultimaSaidaEm: null },
        ],
        AGORA
      )
    ).toBe(0);
  });
});
