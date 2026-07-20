// Integração com a Claude API (Anthropic) — triagem de currículo e resumo de
// histórico de empresa. Todas as funções degradam com erro amigável quando
// ANTHROPIC_API_KEY não está configurada (feature opcional por ambiente).
// A conferência de folha NÃO passa por aqui — é estatística pura, ver
// src/lib/payrollAnomalies.ts.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-4-8";

// Singleton em globalThis pelo mesmo motivo do getPrisma() (src/lib/prisma.ts).
const globalForAi = globalThis as unknown as { __anthropic?: Anthropic };

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient(): Anthropic {
  if (globalForAi.__anthropic) return globalForAi.__anthropic;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY não configurada — recursos de IA desativados.");
  }
  const client = new Anthropic();
  globalForAi.__anthropic = client;
  return client;
}

export type ResumeExtraction = {
  name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  stateCode: string | null;
  education: string | null;
  summary: string; // resumo profissional curto, pt-BR — exibido pro recrutador
};

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"], description: "Nome completo do candidato" },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"], description: "Telefone com DDD, só dígitos e símbolos usuais" },
    city: { type: ["string", "null"] },
    stateCode: { type: ["string", "null"], description: "UF com 2 letras maiúsculas, ex: SC" },
    education: { type: ["string", "null"], description: "Escolaridade/formação mais alta, resumida em uma linha" },
    summary: {
      type: "string",
      description: "Resumo profissional do candidato em 2-4 frases, em português: experiência, competências, senioridade aparente",
    },
  },
  required: ["name", "email", "phone", "city", "stateCode", "education", "summary"],
  additionalProperties: false,
} as const;

export async function extractResumeData(pdfBase64: string): Promise<ResumeExtraction> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    output_config: { format: { type: "json_schema", schema: RESUME_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          {
            type: "text",
            text: "Extraia os dados deste currículo. Campos ausentes no documento ficam null — nunca invente dado de contato.",
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não conseguiu processar este currículo.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Resposta da IA sem conteúdo.");
  }
  return JSON.parse(textBlock.text) as ResumeExtraction;
}

export async function summarizeCompanyHistory(input: {
  companyName: string;
  digest: string; // linhas de evento já montadas pelo chamador (reuniões, transferências, kanban, documentos)
}): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system:
      "Você é assistente de uma contabilidade/BPO. Resuma o histórico operacional de uma empresa-cliente para preparar a equipe antes de uma reunião. Escreva em português do Brasil, direto e factual. Estruture em: visão geral (1 parágrafo), principais acontecimentos, pendências/pontos de atenção. Não invente nada que não esteja nos dados.",
    messages: [
      {
        role: "user",
        content: `Empresa: ${input.companyName}\n\nEventos dos últimos 90 dias:\n${input.digest}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não conseguiu gerar o resumo.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Resposta da IA sem conteúdo.");
  }
  return textBlock.text;
}
