// Integração com IA (Claude/Anthropic ou OpenAI) — triagem de currículo e
// resumo de histórico de empresa. Cada tenant pode configurar a própria
// chave/provedor em Integrações → Inteligência Artificial (TenantAiConfig,
// chave criptografada — ver src/lib/crypto.ts); sem config de tenant, cai no
// fallback global via env (ANTHROPIC_API_KEY/OPENAI_API_KEY). Toda função
// degrada com erro amigável quando nenhuma chave está disponível (feature
// opcional por tenant/ambiente).
// A conferência de folha NÃO passa por aqui — é estatística pura, ver
// src/lib/payrollAnomalies.ts.
import Anthropic from "@anthropic-ai/sdk";
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import type { AiProvider } from "@/generated/prisma/enums";

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
const DEFAULT_OPENAI_MODEL = "gpt-4.1";

type AiCredentials = { provider: AiProvider; apiKey: string; model: string };

async function resolveCredentials(tenantId: string): Promise<AiCredentials | null> {
  const prisma = getPrisma();
  const tenantConfig = await prisma.tenantAiConfig.findUnique({ where: { tenantId } });

  if (tenantConfig) {
    return {
      provider: tenantConfig.provider,
      apiKey: decryptSecret(tenantConfig.apiKeyEnc),
      model: tenantConfig.model || (tenantConfig.provider === "ANTHROPIC" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_OPENAI_MODEL),
    };
  }

  // Sem config de tenant — fallback global via env (ordem: Anthropic, depois OpenAI).
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: "ANTHROPIC", apiKey: process.env.ANTHROPIC_API_KEY, model: DEFAULT_ANTHROPIC_MODEL };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: "OPENAI", apiKey: process.env.OPENAI_API_KEY, model: DEFAULT_OPENAI_MODEL };
  }
  return null;
}

export async function isAiConfigured(tenantId: string): Promise<boolean> {
  return (await resolveCredentials(tenantId)) !== null;
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

async function extractResumeDataAnthropic(apiKey: string, model: string, pdfBase64: string): Promise<ResumeExtraction> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
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

// OpenAI via Responses API (fetch cru, sem SDK — mesmo padrão de
// src/lib/integrations/google.ts e microsoft.ts): input_file com file_data em
// base64 dispensa upload prévio do PDF.
async function extractResumeDataOpenAi(apiKey: string, model: string, pdfBase64: string): Promise<ResumeExtraction> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_file", filename: "curriculo.pdf", file_data: `data:application/pdf;base64,${pdfBase64}` },
            {
              type: "input_text",
              text: "Extraia os dados deste currículo. Campos ausentes no documento ficam null — nunca invente dado de contato.",
            },
          ],
        },
      ],
      text: { format: { type: "json_schema", name: "resume_extraction", schema: RESUME_SCHEMA, strict: true } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao processar currículo com a OpenAI: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.output_text ?? data.output?.find((o: { type: string }) => o.type === "message")?.content?.[0]?.text;
  if (!text) throw new Error("Resposta da IA sem conteúdo.");
  return JSON.parse(text) as ResumeExtraction;
}

export async function extractResumeData(tenantId: string, pdfBase64: string): Promise<ResumeExtraction> {
  const creds = await resolveCredentials(tenantId);
  if (!creds) throw new Error("IA não configurada. Cadastre uma chave em Integrações → Inteligência Artificial.");
  return creds.provider === "ANTHROPIC"
    ? extractResumeDataAnthropic(creds.apiKey, creds.model, pdfBase64)
    : extractResumeDataOpenAi(creds.apiKey, creds.model, pdfBase64);
}

const COMPANY_SUMMARY_SYSTEM_PROMPT =
  "Você é assistente de uma contabilidade/BPO. Resuma o histórico operacional de uma empresa-cliente para preparar a equipe antes de uma reunião. Escreva em português do Brasil, direto e factual. Estruture em: visão geral (1 parágrafo), principais acontecimentos, pendências/pontos de atenção. Não invente nada que não esteja nos dados.";

async function summarizeCompanyHistoryAnthropic(
  apiKey: string,
  model: string,
  input: { companyName: string; digest: string }
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: COMPANY_SUMMARY_SYSTEM_PROMPT,
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

async function summarizeCompanyHistoryOpenAi(
  apiKey: string,
  model: string,
  input: { companyName: string; digest: string }
): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: COMPANY_SUMMARY_SYSTEM_PROMPT,
      input: `Empresa: ${input.companyName}\n\nEventos dos últimos 90 dias:\n${input.digest}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao gerar resumo com a OpenAI: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.output_text ?? data.output?.find((o: { type: string }) => o.type === "message")?.content?.[0]?.text;
  if (!text) throw new Error("Resposta da IA sem conteúdo.");
  return text as string;
}

export async function summarizeCompanyHistory(
  tenantId: string,
  input: { companyName: string; digest: string }
): Promise<string> {
  const creds = await resolveCredentials(tenantId);
  if (!creds) throw new Error("IA não configurada. Cadastre uma chave em Integrações → Inteligência Artificial.");
  return creds.provider === "ANTHROPIC"
    ? summarizeCompanyHistoryAnthropic(creds.apiKey, creds.model, input)
    : summarizeCompanyHistoryOpenAi(creds.apiKey, creds.model, input);
}
