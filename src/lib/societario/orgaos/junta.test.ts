import { describe, it, expect } from "vitest";
import {
  classificarPainel,
  normalizarStatus,
  StatusNaoObservado,
  PainelSemEtapas,
  ProtocoloCancelado,
  protocoloDoReaproveitamento,
  urlDoPainel,
  CONTRATO_PENDENTE,
  SIGLA,
} from "./junta";
import { decidir, OBSERVADORES } from "@/lib/societario/observador";

// O painel do print que o setor mandou em 15/09 (ALV-1), que é o único com uma
// etapa em exigência — e por isso foi o escolhido.
const PAINEL_REAL = [
  { nome: "Consulta Prévia", status: "DEFERIDA" },
  { nome: "Inscrição Municipal", status: "EMITIDO" },
  { nome: "Alvará de Localização e Funcionamento", status: "EM EXIGÊNCIA" },
];

describe("classificarPainel", () => {
  it("o painel real cai em exigência, e diz qual etapa travou", () => {
    const r = classificarPainel(PAINEL_REAL);
    expect(r.desfecho).toBe("EXIGENCIA");
    expect(r.detalhe).toContain("Alvará de Localização e Funcionamento");
  });

  it("exigência ganha de qualquer etapa concluída", () => {
    // Duas de três concluídas não é processo andando: é processo parado
    // esperando o escritório, e o prazo do órgão corre.
    expect(classificarPainel(PAINEL_REAL).desfecho).toBe("EXIGENCIA");
  });

  it("usa o texto do órgão quando a extração trouxe", () => {
    const r = classificarPainel([
      { nome: "Alvará de Localização e Funcionamento", status: "EM EXIGÊNCIA", exigencia: "Anexar planta baixa assinada." },
    ]);
    expect(r.detalhe).toBe("Alvará de Localização e Funcionamento: Anexar planta baixa assinada.");
  });

  it("sem o texto do órgão, a descrição existe e não se passa por palavra dele", () => {
    const r = classificarPainel([{ nome: "Alvará de Localização e Funcionamento", status: "EM EXIGÊNCIA" }]);
    // `decidir` recusa exigência sem descrição — sem isto o processo ficaria
    // pendente em silêncio.
    expect(r.detalhe?.trim()).toBeTruthy();
    expect(r.detalhe).toContain("painel da Junta");
  });

  it("junta as etapas quando mais de uma está em exigência", () => {
    const r = classificarPainel([
      { nome: "Inscrição Municipal", status: "EM EXIGÊNCIA", exigencia: "Falta X." },
      { nome: "Alvará de Localização e Funcionamento", status: "EM EXIGÊNCIA", exigencia: "Falta Y." },
    ]);
    expect(r.detalhe).toBe("Inscrição Municipal: Falta X. · Alvará de Localização e Funcionamento: Falta Y.");
  });

  it("deferido só com todas as etapas concluídas", () => {
    expect(
      classificarPainel([
        { nome: "Consulta Prévia", status: "DEFERIDA" },
        { nome: "Inscrição Municipal", status: "EMITIDO" },
        { nome: "Alvará de Localização e Funcionamento", status: "EMITIDO" },
      ]).desfecho
    ).toBe("DEFERIDO");
  });

  it("aceita a mesma palavra concordando com o nome da etapa", () => {
    expect(classificarPainel([{ nome: "Alvará", status: "DEFERIDO" }]).desfecho).toBe("DEFERIDO");
    expect(classificarPainel([{ nome: "Consulta Prévia", status: "DEFERIDA" }]).desfecho).toBe("DEFERIDO");
  });
});

// Os painéis dos prints da Ruli, 24/09.
const PAINEL_EM_ANALISE = [
  { nome: "Dados da Coleta", status: "COLETADA" },
  { nome: "Ficha de Cadastro Nacional (FCN)", status: "TRANSMITIDO" },
  { nome: "Ato Constitutivo", status: "EM ANÁLISE" },
];
const PAINEL_EM_EXIGENCIA = [
  { nome: "Dados da Coleta", status: "COLETADA" },
  { nome: "Ficha de Cadastro Nacional (FCN)", status: "TRANSMITIDO" },
  { nome: "Ato Constitutivo", status: "EM EXIGÊNCIA" },
];
const PAINEL_REAPROVEITADO = [
  { nome: "Dados da Coleta", status: "CANCELADA" },
  { nome: "Solicitação", status: "CANCELADA" },
];
const AVISO_REAPROVEITADO =
  "ESTE PROCESSO ESTÁ CANCELADO POR TER SIDO REAPROVEITADO PELO USUÁRIO MARCOS REGINALDO DIAS, ÀS 08:57H DO DIA " +
  "12/11/2025 GERANDO OUTRO PROTOCOLO DE NÚMERO: PRP2523827360. CLIQUE AQUI PARA ACOMPANHAR O NOVO PROCESSO.";

describe("os painéis de 24/09", () => {
  it("coleta e FCN concluídas com o ato em análise é pendente", () => {
    expect(classificarPainel(PAINEL_EM_ANALISE).desfecho).toBe("PENDENTE");
  });

  it("o ato constitutivo em exigência cai em exigência, com o nome da etapa", () => {
    const r = classificarPainel(PAINEL_EM_EXIGENCIA);
    expect(r.desfecho).toBe("EXIGENCIA");
    expect(r.detalhe).toContain("Ato Constitutivo");
    expect(r.detalhe).toContain("Visualizar Motivos de Exigência");
  });

  it("processo reaproveitado falha com o protocolo novo", () => {
    expect(() => classificarPainel(PAINEL_REAPROVEITADO, AVISO_REAPROVEITADO)).toThrow(ProtocoloCancelado);
    try {
      classificarPainel(PAINEL_REAPROVEITADO, AVISO_REAPROVEITADO);
    } catch (e) {
      expect((e as ProtocoloCancelado).novoProtocolo).toBe("PRP2523827360");
      expect((e as Error).message).toContain("PRP2523827360");
    }
  });

  it("cancelado sem aviso também falha, pedindo para conferir", () => {
    expect(() => classificarPainel(PAINEL_REAPROVEITADO)).toThrow(/conferir/);
  });

  it("cancelamento ganha de exigência: o processo não existe mais", () => {
    expect(() =>
      classificarPainel([
        { nome: "Alvará", status: "EM EXIGÊNCIA" },
        { nome: "Consulta Prévia", status: "CANCELADA" },
      ])
    ).toThrow(ProtocoloCancelado);
  });

  it("a URL do painel é a do print", () => {
    expect(urlDoPainel(" PRN2676221371 ")).toBe(
      "https://www.empresafacil.pr.gov.br/sigfacil/processo/acompanhar/co_protocolo/PRN2676221371"
    );
  });

  it("acha o protocolo novo no aviso, e nada quando não há aviso", () => {
    expect(protocoloDoReaproveitamento(AVISO_REAPROVEITADO)).toBe("PRP2523827360");
    expect(protocoloDoReaproveitamento(null)).toBeNull();
    expect(protocoloDoReaproveitamento("texto qualquer")).toBeNull();
  });
});

describe("o que o leitor recusa", () => {
  // A partir do dia em que o robô existe, ninguém abre mais o painel à mão.
  // Selo desconhecido virando "pendente" é processo parado sem ninguém saber.
  it("selo não observado falha, e a mensagem leva o texto verbatim", () => {
    expect(() => classificarPainel([{ nome: "Alvará", status: "INDEFERIDA" }])).toThrow(StatusNaoObservado);
    expect(() => classificarPainel([{ nome: "Alvará", status: "INDEFERIDA" }])).toThrow(/INDEFERIDA/);
  });

  it("uma etapa desconhecida derruba o painel inteiro, mesmo com exigência em outra", () => {
    // O contrário seria classificar por leitura parcial: se não entendemos uma
    // etapa, não sabemos se ela concluiu o processo.
    expect(() =>
      classificarPainel([
        { nome: "Alvará", status: "EM EXIGÊNCIA" },
        { nome: "Consulta Prévia", status: "INDEFERIDA" },
      ])
    ).toThrow(StatusNaoObservado);
  });

  it("painel vazio falha em vez de virar pendente", () => {
    expect(() => classificarPainel([])).toThrow(PainelSemEtapas);
  });
});

describe("normalizarStatus", () => {
  it("acento, caixa e espaço duplo não mudam o estado", () => {
    expect(normalizarStatus("Em Exigência")).toBe("EM EXIGENCIA");
    expect(normalizarStatus("  em   exigencia ")).toBe("EM EXIGENCIA");
    expect(normalizarStatus("deferida")).toBe("DEFERIDA");
  });

  it("um selo escapando por acento seria exigência lida como desconhecida", () => {
    expect(classificarPainel([{ nome: "Alvará", status: "em exigencia" }]).desfecho).toBe("EXIGENCIA");
  });
});

describe("a ponte com o observador", () => {
  it("a exigência do painel real passa por decidir sem ser recusada", () => {
    const leitura = classificarPainel(PAINEL_REAL);
    const d = decidir(
      { id: "1", outcome: "PENDENTE", numero: "PRP2151987803", trackingUrl: "x", siglaDoOrgao: SIGLA },
      leitura
    );
    expect(d.tipo).toBe("exigir");
  });

  // Enquanto a navegação não existir, o cron pula o órgão: o setor segue à mão
  // e ninguém recebe informação inventada.
  it("não está registrado em OBSERVADORES", () => {
    expect(OBSERVADORES[SIGLA]).toBeUndefined();
  });

  it("o que falta está no código, não num documento à parte", () => {
    expect(CONTRATO_PENDENTE.join(" ")).toContain("CAPTCHA");
  });
});
