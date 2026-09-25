import { describe, it, expect } from "vitest";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import {
  descreverProposta,
  descricaoDaTransferencia,
  encaminhamentoPedido,
  IA_DO_SETOR,
  SETORES_DO_ENCAMINHAMENTO,
} from "./regras";
import { somarEncaminhamentos } from "./painel";
import { FERRAMENTAS_DO_ORQUESTRADOR } from "@/lib/ia/ferramentas-orquestrador";

describe("orquestrador do chat", () => {
  it("todo destino com IA aponta para um agente do catálogo que também sabe encaminhar", () => {
    for (const setor of SETORES_DO_ENCAMINHAMENTO) {
      const code = IA_DO_SETOR[setor];
      if (!code) continue;
      const def = agenteDoCatalogo(code);
      expect(def, code).toBeDefined();
      expect(def!.ferramentas, code).toContain("encaminhar_pergunta");
    }
  });

  it("só o Contábil (sem módulo no Connect) e 'outro' ficam sem IA", () => {
    expect(SETORES_DO_ENCAMINHAMENTO.filter((s) => IA_DO_SETOR[s] === null)).toEqual(["contabil", "outro"]);
  });

  it("a ferramenta oferece exatamente os setores que a rota entende", () => {
    const params = FERRAMENTAS_DO_ORQUESTRADOR.encaminhar_pergunta!.def.parametros as {
      properties: { setor: { enum: string[] } };
    };
    expect(params.properties.setor.enum).toEqual([...SETORES_DO_ENCAMINHAMENTO]);
  });

  it("lê o pedido de encaminhamento e ignora setor inventado", () => {
    expect(
      encaminhamentoPedido([
        { ferramenta: "propor_concluir_etapa", argumentos: {} },
        { ferramenta: "encaminhar_pergunta", argumentos: { setor: "marketing", motivo: "x" } },
        { ferramenta: "encaminhar_pergunta", argumentos: { setor: "fiscal", motivo: " nota da ACME " } },
      ])
    ).toEqual({ setor: "fiscal", motivo: "nota da ACME" });
    expect(encaminhamentoPedido([])).toBeNull();
  });

  it("a transferência leva a pergunta como foi feita", () => {
    expect(descricaoDaTransferencia("  quando vence a DAS? ", "DAS da ACME")).toBe(
      'Pergunta feita no chat de IA: "quando vence a DAS?"\n\nAssunto: DAS da ACME'
    );
    expect(descreverProposta({ ferramenta: "abrir_transferencia", descricao: "", alvo: "Fiscal" })).toBe(
      "Abrir uma transferência para Fiscal"
    );
  });

  it("o painel conta pares e perguntas sem IA, sem ler conteúdo", () => {
    const r = somarEncaminhamentos([
      { action: "ia.chat.encaminhada", metadata: { de: "assistente_do_bpo", para: "fiscal", desfecho: "respondida" } },
      { action: "ia.chat.encaminhada", metadata: { de: "assistente_do_bpo", para: "fiscal", desfecho: "transferencia_oferecida" } },
      { action: "ia.chat.encaminhada", metadata: { de: "ajuda_do_connect", para: "dp", desfecho: "sem_destino" } },
      { action: "ia.chat.sem_ia", metadata: { de: "ajuda_do_connect", para: "outro" } },
    ]);
    expect(r.encaminhamentos[0]).toEqual({ de: "assistente_do_bpo", para: "fiscal", respondidas: 1, transferencias: 1, semDestino: 0 });
    expect(r.encaminhamentos[1]).toEqual({ de: "ajuda_do_connect", para: "dp", respondidas: 0, transferencias: 0, semDestino: 1 });
    expect(r.semIa).toEqual({ ajuda_do_connect: 1 });
  });
});
