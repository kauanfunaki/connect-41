import { describe, expect, it } from "vitest";
import {
  csvDaTabela,
  leituraDaProdutividade,
  leituraDasVoltas,
  leituraDoCusto,
  leituraDoSla,
  lerRelatorio,
  lerVisao,
  tabelaDoSla,
} from "./relatoriosNaTela";
import type { LinhaDeSla, LinhaDeProdutividade } from "./relatorios";

const sla = (p: Partial<LinhaDeSla>): LinhaDeSla => ({
  tipoId: "t",
  tipoNome: "Abertura",
  previstoMin: 15,
  previstoMax: 20,
  total: 10,
  concluidos: 5,
  dentro: 10,
  noLimite: 0,
  estourados: 0,
  semPrevisao: 0,
  mediaDeDias: 12,
  mediaDeVoltas: 0,
  ...p,
});

describe("relatórios do Societário, um por vez (04/11/2026)", () => {
  it("relatório e visão desconhecidos caem no primeiro e no gráfico", () => {
    expect(lerRelatorio("xyz").chave).toBe("sla");
    expect(lerRelatorio("custo").chave).toBe("custo");
    expect(lerVisao("tabela")).toBe("tabela");
    expect(lerVisao("outra")).toBe("grafico");
  });

  it("SLA: aponta o tipo que mais estoura em proporção, sem contar o sem previsão", () => {
    const frase = leituraDoSla([
      sla({ tipoNome: "Abertura", total: 18, estourados: 3, dentro: 15, mediaDeVoltas: 0.6 }),
      sla({ tipoNome: "Baixa", total: 4, estourados: 2, dentro: 2 }),
      sla({ tipoNome: "Licença", previstoMax: null, previstoMin: null, total: 9, estourados: 0, dentro: 0 }),
    ]);
    expect(frase).toBe("Baixa é o tipo que mais estoura: 2 de 4. No total, 5 processos estouraram o previsto.");
    expect(leituraDoSla([sla({})])).toBe("Nenhum tipo estourou o prazo no período.");
    expect(leituraDoSla([])).toBe("Nenhum processo no período.");
  });

  it("voltas e produtividade", () => {
    expect(leituraDasVoltas({ processos: 10, comVolta: 0, percentualComVolta: 0, totalDeVoltas: 0 }, [])).toContain("Nenhum processo voltou");
    const pessoa = (nome: string, concluidos: number, estourados: number): LinhaDeProdutividade => ({
      responsavelId: nome,
      nome,
      abertos: 3,
      estouradosAbertos: estourados,
      concluidosNoPeriodo: concluidos,
      mediaDeDiasDosConcluidos: 10,
      voltasDosConcluidos: 0,
    });
    expect(leituraDaProdutividade([pessoa("Ana", 23, 2), pessoa("Bia", 31, 0)])).toBe(
      "54 processos concluídos; Bia concluiu 31. 2 abertos estão estourados — 2 com Ana."
    );
  });

  it("custo: o total, o mais caro e a parte das voltas", () => {
    const frase = leituraDoCusto(
      [{ id: "p", tipoNome: "Abertura", empresaNome: "Empresa X", voltas: 1, totalCentavos: 222000, pagoCentavos: 0, custoDasVoltasCentavos: 54000 }],
      { totalCentavos: 222000, custoDasVoltasCentavos: 54000 }
    );
    expect(frase).toContain("o mais caro foi Abertura — Empresa X");
    expect(frase).toContain("(24%) vieram de reapresentação");
  });

  it("CSV: ponto e vírgula, vírgula decimal, reais em reais, traço do sem previsão vazio", () => {
    const csv = csvDaTabela(tabelaDoSla([sla({ mediaDeDias: 17.2 }), sla({ tipoNome: 'Licença "LISA"', previstoMax: null, previstoMin: null })]));
    const [cabecalho, l1, l2] = csv.replace("﻿", "").split("\r\n");
    expect(cabecalho.startsWith('"Tipo";"Previsto (dias úteis)";"Processos"')).toBe(true);
    expect(l1).toBe('"Abertura";"15–20";10;5;10;0;0;17,2;0');
    expect(l2).toBe('"Licença ""LISA""";"sem previsão";10;5;;;;12;0');
  });
});
