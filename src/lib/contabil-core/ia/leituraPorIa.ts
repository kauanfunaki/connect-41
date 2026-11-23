import "server-only";

// A peça comum "documento → IA" do Contábil Core (Bloco C, 19/11/2026). O original mandava extrato,
// nota fiscal, comprovante e fatura de cartão direto à OpenAI, com a chave do servidor, atrás de
// `ALLOW_FINANCIAL_DATA_TO_OPENAI` (desligada por padrão) e de um orçamento por arquivo (`_Budget`:
// tempo, páginas e chamadas). Aqui a chamada passa pela fundação de IA do Connect (`gerarTexto` em
// `src/lib/ai.ts`, que é `executarAgente`): o provedor e a chave são do escritório (Integrações ›
// Inteligência artificial), o agente precisa estar no catálogo e ligado, o teto do mês é conferido
// antes, e cada chamada deixa uma linha de auditoria.
//
// O que esta peça confere, nesta ordem, antes de gastar:
// 1. a chave do escritório para documento financeiro ir à IA (`documentosFinanceirosLiberados`,
//    desligada por padrão; quem chama a lê de `TenantContabilCoreConfig.iaDocumentosFinanceiros` —
//    `iaLiberadaParaDocumentos` em `servidor/notas.ts` —, que quem coordena liga em Configurações);
// 2. se o escritório tem provedor de IA configurado;
// 3. o orçamento do arquivo (tempo e chamadas) — esgotado, LANÇA `OrcamentoEsgotado`, como o original.
// Depois chama o agente e devolve o texto cru da resposta. A interpretação (JSON, campos) é de quem
// chama: a nota fiscal (`notas/visual.ts`), o comprovante de pagamento (`comprovantes/leitor.ts`, C2) e,
// depois, as faturas.

import { gerarTexto, isAiConfigured, type ContextoDaChamada } from "@/lib/ai";

/** Os limites do original (`pdf_parse_timeout_seconds`, `pdf_max_pages`, `pdf_max_ai_calls`). */
export const ORCAMENTO_PADRAO = { segundos: 60, maxPaginas: 120, maxChamadas: 30 } as const;

/** O orçamento acabou: a leitura para com a frase do original (`VisualParseError`). */
export class OrcamentoEsgotado extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "OrcamentoEsgotado";
  }
}

/** As frases do orçamento esgotado. Cada leitor do original tinha as suas (o de comprovante fala em "PDF"). */
export type FrasesDoOrcamento = { tempo: string; chamadas: string };

const FRASES_PADRAO: FrasesDoOrcamento = {
  tempo: "Processamento do arquivo excedeu o tempo limite.",
  chamadas: "Arquivo excedeu o limite de chamadas ao serviço de IA.",
};

/** O `_Budget` do original: um por arquivo, com o relógio monotônico. */
export class Orcamento {
  readonly prazo: number;
  readonly maxPaginas: number;
  chamadasRestantes: number;
  private readonly frases: FrasesDoOrcamento;

  constructor(
    limites: { segundos?: number; maxPaginas?: number; maxChamadas?: number; frases?: FrasesDoOrcamento } = {},
    private readonly agora: () => number = () => performance.now(),
  ) {
    this.prazo = this.agora() + (limites.segundos ?? ORCAMENTO_PADRAO.segundos) * 1000;
    this.maxPaginas = limites.maxPaginas ?? ORCAMENTO_PADRAO.maxPaginas;
    this.chamadasRestantes = limites.maxChamadas ?? ORCAMENTO_PADRAO.maxChamadas;
    this.frases = limites.frases ?? FRASES_PADRAO;
  }

  verificarTempo(): void {
    if (this.agora() > this.prazo) throw new OrcamentoEsgotado(this.frases.tempo);
  }

  consumirChamada(): void {
    this.verificarTempo();
    if (this.chamadasRestantes <= 0) throw new OrcamentoEsgotado(this.frases.chamadas);
    this.chamadasRestantes -= 1;
  }

  /** `timeout_restante`: o que sobra do prazo, entre 1 s e 30 s, em milissegundos. */
  get tempoDaChamadaMs(): number {
    this.verificarTempo();
    return Math.max(1000, Math.min(30_000, this.prazo - this.agora()));
  }
}

/** Quem pede a leitura: o escritório, a chave dele para documento financeiro, e quem clicou. */
export type ContextoDeLeitura = {
  tenantId: string;
  /**
   * A chave do escritório que libera mandar documento financeiro à IA (o
   * `ALLOW_FINANCIAL_DATA_TO_OPENAI` do original). Ausente vale desligada: sem ela, nada vai à IA.
   */
  documentosFinanceirosLiberados?: boolean;
  /** Quem clicou e a empresa do Contábil Core: vão para a linha de auditoria da chamada. */
  userId?: string | null;
  empresaId?: string | null;
  contexto?: ContextoDaChamada;
};

export type PedidoDeLeitura = {
  /** O agente do catálogo (`src/lib/ia/catalogo.ts`) — define o modelo e o teto. */
  agentCode: string;
  sistema: string;
  texto: string;
  /** O documento: imagem (PNG/JPEG) ou PDF. */
  anexo?: { nome: string; mime: string; bytes: Uint8Array };
  maxTokens: number;
  orcamento: Orcamento;
};

export type MotivoDaRecusa = "desligada" | "sem_provedor" | "falha";

export type ResultadoDaLeitura = { ok: true; texto: string } | { ok: false; motivo: MotivoDaRecusa; mensagem: string };

/** A frase do original ("OCR externo desabilitado..."), dizendo o que ligar no Connect. */
export const LEITURA_DESLIGADA =
  "OCR externo desabilitado. Ligue, em Contábil Core › Configurações › Leitura de documentos por IA, o consentimento explícito para enviar dados financeiros ao provedor de IA.";
export const SEM_PROVEDOR =
  "OCR externo desabilitado. Nenhuma chave de IA configurada: configure em Integrações › Inteligência artificial.";

/** O que a peça usa da fundação de IA (os testes trocam). */
export type DependenciasDaIa = { gerarTexto: typeof gerarTexto; isAiConfigured: typeof isAiConfigured };
const PADRAO: DependenciasDaIa = { gerarTexto, isAiConfigured };

/**
 * Manda o texto (e o documento) ao agente e devolve o texto da resposta, ou a recusa.
 *
 * Recusa sem gastar quando a chave está desligada ou o escritório não tem provedor; lança
 * `OrcamentoEsgotado` quando o arquivo já gastou o tempo ou as chamadas; e devolve `falha` quando o
 * provedor, o agente (desligado, teto do mês) ou a rede falharem — a mensagem é a da fundação.
 */
export async function lerPorIa(
  quem: ContextoDeLeitura,
  pedido: PedidoDeLeitura,
  ia: DependenciasDaIa = PADRAO,
): Promise<ResultadoDaLeitura> {
  if (quem.documentosFinanceirosLiberados !== true) return { ok: false, motivo: "desligada", mensagem: LEITURA_DESLIGADA };
  if (!(await ia.isAiConfigured(quem.tenantId))) return { ok: false, motivo: "sem_provedor", mensagem: SEM_PROVEDOR };
  pedido.orcamento.consumirChamada();
  const timeoutMs = pedido.orcamento.tempoDaChamadaMs;
  try {
    const texto = await ia.gerarTexto({
      tenantId: quem.tenantId,
      agentCode: pedido.agentCode,
      sistema: pedido.sistema,
      texto: pedido.texto,
      anexos: pedido.anexo
        ? [
            {
              nome: pedido.anexo.nome,
              mime: pedido.anexo.mime,
              base64: Buffer.from(pedido.anexo.bytes).toString("base64"),
              imagem: pedido.anexo.mime.startsWith("image/"),
            },
          ]
        : undefined,
      maxTokens: pedido.maxTokens,
      timeoutMs,
      contexto: quem.contexto ?? {
        userId: quem.userId ?? null,
        entityType: quem.empresaId ? "core_empresa" : null,
        entityId: quem.empresaId ?? null,
      },
    });
    return { ok: true, texto };
  } catch (e) {
    return { ok: false, motivo: "falha", mensagem: e instanceof Error ? e.message : String(e) };
  }
}
