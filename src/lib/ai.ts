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

// Descrições pedem tamanho máximo explícito — o structured output garante a
// FORMA do JSON, não o tamanho da string, e as colunas no banco são VARCHAR
// curtas (ver truncamento defensivo em candidatos/[id]/ai-actions.ts).
const RESUME_SCHEMA = {
  type: "object",
  properties: {
    name: { type: ["string", "null"], description: "Nome completo do candidato, no máximo 180 caracteres" },
    email: { type: ["string", "null"], description: "No máximo 120 caracteres" },
    phone: { type: ["string", "null"], description: "Telefone com DDD, só dígitos e símbolos usuais, no máximo 30 caracteres" },
    city: { type: ["string", "null"], description: "Só o nome da cidade, sem estado/país, no máximo 80 caracteres" },
    stateCode: { type: ["string", "null"], description: "UF com exatamente 2 letras maiúsculas, ex: SC" },
    education: {
      type: ["string", "null"],
      description: "Escolaridade/formação mais alta, resumida ao essencial (ex: 'Superior completo em Administração'), no máximo 80 caracteres — nunca inclua nome de instituição ou ano",
    },
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

// Avaliação de Atendimentos — nota de escrita (0-50) de um atendimento do
// Chatwoot, metade da nota final de 0-100 (a outra metade, SLA, é calculada
// de forma determinística em src/lib/chatwoot/evaluation.ts, sem IA). CSAT foi
// cogitado e descartado (ver Backlog-Avaliacao-Atendimentos-2026-07-24.md no
// vault) — só português/educação entram aqui.
export type WritingEvaluation = { writingScore: number; reasoning: string };

const WRITING_EVALUATION_SYSTEM_PROMPT =
  "Você avalia a qualidade da ESCRITA do atendente (não do cliente) em uma conversa de atendimento via WhatsApp de um escritório de contabilidade/BPO. Critérios: português correto (ortografia, gramática, concordância), tom educado e profissional, clareza da comunicação. Ignore o mérito técnico da resposta (se resolveu o problema certo ou não) — avalie só a forma como o atendente escreveu. Dê uma nota de 0 a 50 e uma justificativa objetiva em português, 1-3 frases.";

const WRITING_EVALUATION_SCHEMA = {
  type: "object",
  properties: {
    writingScore: { type: "integer", minimum: 0, maximum: 50, description: "Nota de 0 a 50 para a qualidade da escrita do atendente" },
    reasoning: { type: "string", description: "Justificativa curta (1-3 frases) em português, citando o que pesou na nota" },
  },
  required: ["writingScore", "reasoning"],
  additionalProperties: false,
} as const;

async function evaluateConversationWritingAnthropic(apiKey: string, model: string, transcript: string): Promise<WritingEvaluation> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: WRITING_EVALUATION_SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: WRITING_EVALUATION_SCHEMA } },
    messages: [{ role: "user", content: `Transcrição do atendimento:\n\n${transcript}` }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não conseguiu avaliar este atendimento.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Resposta da IA sem conteúdo.");
  }
  return JSON.parse(textBlock.text) as WritingEvaluation;
}

async function evaluateConversationWritingOpenAi(apiKey: string, model: string, transcript: string): Promise<WritingEvaluation> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: WRITING_EVALUATION_SYSTEM_PROMPT,
      input: `Transcrição do atendimento:\n\n${transcript}`,
      text: { format: { type: "json_schema", name: "writing_evaluation", schema: WRITING_EVALUATION_SCHEMA, strict: true } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao avaliar atendimento com a OpenAI: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.output_text ?? data.output?.find((o: { type: string }) => o.type === "message")?.content?.[0]?.text;
  if (!text) throw new Error("Resposta da IA sem conteúdo.");
  return JSON.parse(text) as WritingEvaluation;
}

export async function evaluateConversationWriting(tenantId: string, transcript: string): Promise<WritingEvaluation> {
  const creds = await resolveCredentials(tenantId);
  if (!creds) throw new Error("IA não configurada. Cadastre uma chave em Integrações → Inteligência Artificial.");
  return creds.provider === "ANTHROPIC"
    ? evaluateConversationWritingAnthropic(creds.apiKey, creds.model, transcript)
    : evaluateConversationWritingOpenAi(creds.apiKey, creds.model, transcript);
}

// Resumo consolidado de um atendente — lê N avaliações já prontas (nota +
// reasoning de cada uma, ver evaluateConversationWriting/computeSlaScore) e
// escreve um parágrafo só com os padrões recorrentes, citando quais
// atendimentos melhor ilustram cada ponto (pra virar link de prova no
// drill-down que já existe). Sob demanda — nunca chamado automaticamente.
export type AgentSummaryInput = { conversationId: string; score: number; writingScore: number; slaScore: number; reasoning: string };
export type AgentSummaryResult = { summary: string; examples: { conversationId: string; note: string }[] };

const AGENT_SUMMARY_SYSTEM_PROMPT =
  "Você analisa um conjunto de avaliações de atendimento (nota de escrita 0-50 e nota de SLA 0-50, já geradas por outra IA) de UM MESMO atendente de um escritório de contabilidade/BPO, pra identificar padrões recorrentes — tanto problemas quanto pontos fortes. Escreva um resumo consolidado em português do Brasil, 3-5 frases, citando tendências reais (ex: 'comete erros de concordância com frequência', 'sempre responde dentro do prazo, mas demora pra resolver o problema'). Não invente padrão que não apareça em pelo menos 2 avaliações. Depois, selecione até 5 atendimentos da lista fornecida que melhor ilustram os pontos citados no resumo — cite o id exatamente como foi fornecido, nunca invente um id novo.";

const AGENT_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Resumo consolidado em português, 3-5 frases" },
    examples: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          conversationId: { type: "string", description: "Um dos ids fornecidos na lista, copiado exatamente" },
          note: { type: "string", description: "Por que esse atendimento ilustra o ponto citado, 1 frase curta" },
        },
        required: ["conversationId", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "examples"],
  additionalProperties: false,
} as const;

function buildAgentSummaryPrompt(agentLabel: string, evaluations: AgentSummaryInput[]): string {
  const list = evaluations
    .map((e, i) => `${i + 1}. id: ${e.conversationId} | nota geral: ${e.score}/100 (escrita ${e.writingScore}/50, SLA ${e.slaScore}/50) | justificativa: ${e.reasoning}`)
    .join("\n");
  return `Atendente: ${agentLabel}\n\nAvaliações (${evaluations.length} atendimentos):\n${list}`;
}

async function summarizeAgentEvaluationsAnthropic(apiKey: string, model: string, agentLabel: string, evaluations: AgentSummaryInput[]): Promise<AgentSummaryResult> {
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model,
    max_tokens: 1536,
    thinking: { type: "adaptive" },
    system: AGENT_SUMMARY_SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: AGENT_SUMMARY_SCHEMA } },
    messages: [{ role: "user", content: buildAgentSummaryPrompt(agentLabel, evaluations) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("A IA não conseguiu gerar o resumo.");
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Resposta da IA sem conteúdo.");
  }
  return JSON.parse(textBlock.text) as AgentSummaryResult;
}

async function summarizeAgentEvaluationsOpenAi(apiKey: string, model: string, agentLabel: string, evaluations: AgentSummaryInput[]): Promise<AgentSummaryResult> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: AGENT_SUMMARY_SYSTEM_PROMPT,
      input: buildAgentSummaryPrompt(agentLabel, evaluations),
      text: { format: { type: "json_schema", name: "agent_summary", schema: AGENT_SUMMARY_SCHEMA, strict: true } },
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao gerar resumo com a OpenAI: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data.output_text ?? data.output?.find((o: { type: string }) => o.type === "message")?.content?.[0]?.text;
  if (!text) throw new Error("Resposta da IA sem conteúdo.");
  return JSON.parse(text) as AgentSummaryResult;
}

export async function summarizeAgentEvaluations(tenantId: string, agentLabel: string, evaluations: AgentSummaryInput[]): Promise<AgentSummaryResult> {
  const creds = await resolveCredentials(tenantId);
  if (!creds) throw new Error("IA não configurada. Cadastre uma chave em Integrações → Inteligência Artificial.");
  const result =
    creds.provider === "ANTHROPIC"
      ? await summarizeAgentEvaluationsAnthropic(creds.apiKey, creds.model, agentLabel, evaluations)
      : await summarizeAgentEvaluationsOpenAi(creds.apiKey, creds.model, agentLabel, evaluations);

  // Defensivo: nunca confiar cegamente que a IA só citou ids que existem na
  // lista fornecida (mesmo com json_schema, o VALOR de uma string livre pode
  // vir errado) — um id inventado viraria um link morto no drill-down.
  const validIds = new Set(evaluations.map((e) => e.conversationId));
  return { ...result, examples: result.examples.filter((ex) => validIds.has(ex.conversationId)) };
}
