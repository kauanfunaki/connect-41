import { describe, it, expect } from "vitest";
import {
  etapasLiberadas,
  voltasPorOrgao,
  totalDeVoltas,
  proximaTentativa,
  situacaoDoProcesso,
  prazoDoProcesso,
  type EtapaDoRoteiro,
  type EtapaDaInstancia,
  type Protocolo,
} from "./processo";

// As regras testadas aqui saem do fluxograma do setor, não do protótipo. Cada
// bloco cita o trecho do fluxo que o motiva — se o setor mudar o fluxo, é este
// arquivo que precisa discordar primeiro.

// O roteiro da Constituição, reduzido ao que a regra de liberação enxerga.
const constituicao: EtapaDoRoteiro[] = [
  { templateStepId: "doc", position: 1, parallelGroup: null, optional: false },
  { templateStepId: "viabilidade", position: 2, parallelGroup: null, optional: false },
  { templateStepId: "minuta", position: 3, parallelGroup: null, optional: false },
  { templateStepId: "junta", position: 4, parallelGroup: null, optional: false },
  { templateStepId: "receita", position: 5, parallelGroup: null, optional: false },
];

// O alvará: três etapas em sequência e depois a ramificação das licenças, que
// o próprio setor descreve como paralela e variável.
const alvara: EtapaDoRoteiro[] = [
  { templateStepId: "informacoes", position: 1, parallelGroup: null, optional: false },
  { templateStepId: "taxa", position: 2, parallelGroup: null, optional: false },
  { templateStepId: "bombeiros", position: 3, parallelGroup: "licencas", optional: true },
  { templateStepId: "ambiente", position: 3, parallelGroup: "licencas", optional: true },
  { templateStepId: "sanitaria", position: 3, parallelGroup: "licencas", optional: true },
  { templateStepId: "envio", position: 4, parallelGroup: null, optional: false },
];

function instancia(pares: Record<string, EtapaDaInstancia["status"]>): EtapaDaInstancia[] {
  return Object.entries(pares).map(([templateStepId, status]) => ({ templateStepId, status }));
}

describe("etapasLiberadas", () => {
  it("processo novo libera só a primeira etapa", () => {
    expect(etapasLiberadas(constituicao, [])).toEqual(["doc"]);
  });

  it("anda uma por vez enquanto o roteiro for sequencial", () => {
    const liberadas = etapasLiberadas(constituicao, instancia({ doc: "CONCLUIDA" }));
    expect(liberadas).toEqual(["viabilidade"]);
  });

  it("etapa em andamento continua liberada — trabalho começado não sai da lista", () => {
    const liberadas = etapasLiberadas(
      constituicao,
      instancia({ doc: "CONCLUIDA", viabilidade: "EM_ANDAMENTO" })
    );
    expect(liberadas).toEqual(["viabilidade"]);
  });

  // Esta é a regra que o alvará exige, e é o caso que uma lista ordenada não
  // expressa: as três licenças correm juntas e independentes.
  it("as três licenças do alvará liberam ao mesmo tempo", () => {
    const liberadas = etapasLiberadas(
      alvara,
      instancia({ informacoes: "CONCLUIDA", taxa: "CONCLUIDA" })
    );
    expect(liberadas.sort()).toEqual(["ambiente", "bombeiros", "sanitaria"]);
  });

  it("concluir uma licença não libera o que vem depois das outras duas", () => {
    const liberadas = etapasLiberadas(
      alvara,
      instancia({ informacoes: "CONCLUIDA", taxa: "CONCLUIDA", bombeiros: "CONCLUIDA" })
    );
    expect(liberadas.sort()).toEqual(["ambiente", "sanitaria"]);
    expect(liberadas).not.toContain("envio");
  });

  // "Cada licença possui particularidades próprias" — nem toda empresa precisa
  // das três. Dispensada não pode segurar o processo para sempre.
  it("licença dispensada não trava o processo", () => {
    const liberadas = etapasLiberadas(
      alvara,
      instancia({
        informacoes: "CONCLUIDA",
        taxa: "CONCLUIDA",
        bombeiros: "CONCLUIDA",
        ambiente: "DISPENSADA",
        sanitaria: "DISPENSADA",
      })
    );
    expect(liberadas).toEqual(["envio"]);
  });

  it("roteiro inteiro encerrado não libera nada", () => {
    const todas = instancia(
      Object.fromEntries(constituicao.map((e) => [e.templateStepId, "CONCLUIDA" as const]))
    );
    expect(etapasLiberadas(constituicao, todas)).toEqual([]);
  });
});

describe("voltas de exigência", () => {
  // "Registro deferido? Não → Exigências → Ajustes e reapresentação → volta."
  // A primeira apresentação não é volta; da segunda em diante é.
  it("primeira apresentação não conta como volta", () => {
    const p: Protocolo[] = [{ organId: "junta", attempt: 1, outcome: "PENDENTE" }];
    expect(totalDeVoltas(p)).toBe(0);
  });

  it("cada reapresentação conta uma volta, por órgão", () => {
    const p: Protocolo[] = [
      { organId: "junta", attempt: 1, outcome: "EXIGENCIA" },
      { organId: "junta", attempt: 2, outcome: "EXIGENCIA" },
      { organId: "junta", attempt: 3, outcome: "DEFERIDO" },
      { organId: "receita", attempt: 1, outcome: "DEFERIDO" },
    ];
    const porOrgao = voltasPorOrgao(p);
    expect(porOrgao.get("junta")).toBe(2);
    expect(porOrgao.get("receita")).toBe(0);
    // Duas voltas na Junta e nenhuma na Receita é uma história diferente de
    // uma em cada — por isso o total não substitui a quebra por órgão.
    expect(totalDeVoltas(p)).toBe(2);
  });

  it("a próxima tentativa continua de onde o órgão parou", () => {
    const p: Protocolo[] = [
      { organId: "junta", attempt: 1, outcome: "EXIGENCIA" },
      { organId: "junta", attempt: 2, outcome: "EXIGENCIA" },
    ];
    expect(proximaTentativa(p, "junta")).toBe(3);
    // Órgão que ainda não recebeu nada começa em 1, não herda a contagem do outro.
    expect(proximaTentativa(p, "receita")).toBe(1);
  });
});

describe("situacaoDoProcesso", () => {
  it("sem protocolo é trabalho interno", () => {
    expect(situacaoDoProcesso([], false)).toBe("EM_ANDAMENTO");
  });

  it("protocolo pendente é espera de órgão", () => {
    expect(
      situacaoDoProcesso([{ organId: "junta", attempt: 1, outcome: "PENDENTE" }], false)
    ).toBe("AGUARDANDO_ORGAO");
  });

  // A precedência importa: exigência é trabalho parado esperando gente, espera
  // é trabalho parado esperando órgão. Quem olha a fila precisa ver primeiro o
  // que depende dele.
  it("exigência ganha de espera quando os dois existem", () => {
    const p: Protocolo[] = [
      { organId: "junta", attempt: 1, outcome: "EXIGENCIA" },
      { organId: "receita", attempt: 1, outcome: "PENDENTE" },
    ];
    expect(situacaoDoProcesso(p, false)).toBe("EM_EXIGENCIA");
  });

  it("concluído ganha de tudo", () => {
    const p: Protocolo[] = [{ organId: "junta", attempt: 1, outcome: "EXIGENCIA" }];
    expect(situacaoDoProcesso(p, true)).toBe("CONCLUIDO");
  });
});

describe("prazoDoProcesso", () => {
  const inicio = new Date("2026-09-01T09:00:00Z");
  const constituicaoTipo = { expectedDaysMin: 4, expectedDaysMax: 7, variableFlow: false };

  it("dentro do prazo enquanto não passa do teto", () => {
    const r = prazoDoProcesso(
      constituicaoTipo,
      { startedAt: inicio, concludedAt: null },
      new Date("2026-09-06T09:00:00Z")
    );
    expect(r.dias).toBe(5);
    expect(r.situacao).toBe("dentro");
  });

  it("no limite exatamente no teto — ainda não estourou", () => {
    const r = prazoDoProcesso(
      constituicaoTipo,
      { startedAt: inicio, concludedAt: null },
      new Date("2026-09-08T09:00:00Z")
    );
    expect(r.dias).toBe(7);
    expect(r.situacao).toBe("no_limite");
  });

  it("estourado no dia seguinte ao teto", () => {
    const r = prazoDoProcesso(
      constituicaoTipo,
      { startedAt: inicio, concludedAt: null },
      new Date("2026-09-09T09:00:00Z")
    );
    expect(r.dias).toBe(8);
    expect(r.situacao).toBe("estourado");
  });

  it("processo concluído para de contar na conclusão, não em hoje", () => {
    const r = prazoDoProcesso(
      constituicaoTipo,
      { startedAt: inicio, concludedAt: new Date("2026-09-05T09:00:00Z") },
      new Date("2026-10-30T09:00:00Z")
    );
    expect(r.dias).toBe(4);
    expect(r.situacao).toBe("dentro");
  });

  // O setor declara o alvará como "fluxo variável", sem prazo médio. Prometer
  // previsão onde o setor não promete é pior que não prever.
  it("alvará não recebe previsão, por mais que demore", () => {
    const r = prazoDoProcesso(
      { expectedDaysMin: null, expectedDaysMax: null, variableFlow: true },
      { startedAt: inicio, concludedAt: null },
      new Date("2026-12-01T09:00:00Z")
    );
    expect(r.situacao).toBe("sem_previsao");
    expect(r.dias).toBeGreaterThan(80);
  });
});
