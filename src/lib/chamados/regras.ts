import { z } from "zod";

export const MODULO = "helpdesk";
export const STATUS = ["ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"] as const;
export type Status = (typeof STATUS)[number];
export const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export const ROTULOS: Record<Status, string> = {
  ABERTO: "Aberto", NA_FILA: "Na fila", EM_ANDAMENTO: "Em andamento", AGUARDANDO_USUARIO: "Aguardando usuário",
  AGUARDANDO_APROVACAO: "Aguardando aprovação", AGUARDANDO_REQUERENTE: "Aguardando requerente", STANDBY: "Em espera", RESOLVIDO: "Resolvido", CANCELADO: "Cancelado",
};
export const ROTULOS_PRIORIDADE: Record<Prioridade, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" };
export const fechado = (status: string) => status === "RESOLVIDO" || status === "CANCELADO";
export const pausado = (status: string) => ["AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO", "AGUARDANDO_REQUERENTE", "STANDBY"].includes(status);
export const aguardandoSolicitante = (status: string) => status === "AGUARDANDO_USUARIO" || status === "AGUARDANDO_REQUERENTE";

const id = z.string().trim().min(1).max(191);
export const campoSchema = z.object({
  key: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80), label: z.string().trim().min(1).max(120),
  type: z.enum(["text", "textarea", "email", "number", "select"]), required: z.boolean().default(false),
  options: z.array(z.string().min(1).max(200)).max(50).default([]), placeholder: z.string().max(200).default(""),
  helpText: z.string().max(500).default(""),
  rules: z.object({ minLen: z.number().int().min(0).max(10000).optional(), maxLen: z.number().int().min(1).max(10000).optional(), min: z.number().optional(), max: z.number().optional() }).default({}),
});
export const requisitoAnexoSchema = z.object({ key: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80), label: z.string().min(1).max(120), required: z.boolean().default(false), mime: z.array(z.string().max(120)).max(20).default([]) });
export const checklistSchema = z.object({ key: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80), label: z.string().min(1).max(255) });
export const categoriaSchema = z.object({
  id: id.optional(), name: z.string().trim().min(1).max(120), parentId: id.nullable().default(null), active: z.boolean().default(true),
  descriptionTemplate: z.string().max(15000).default(""), templateApplyMode: z.enum(["replace_if_empty", "append"]).default("replace_if_empty"),
  formSchema: z.array(campoSchema).max(30).default([]), requiredAttachments: z.array(requisitoAnexoSchema).max(5).default([]), checklistTemplate: z.array(checklistSchema).max(40).default([]),
  requiresApproval: z.boolean().default(false), approvalMode: z.enum(["REQUESTER_COORDINATOR", "SPECIFIC_USERS"]).default("REQUESTER_COORDINATOR"), approvalUserIds: z.array(id).max(30).default([]),
}).superRefine((c, ctx) => {
  for (const key of ["formSchema", "requiredAttachments", "checklistTemplate"] as const) {
    if (new Set(c[key].map(f => f.key)).size !== c[key].length) ctx.addIssue({ code: "custom", path: [key], message: "Chaves repetidas." });
  }
  if (c.requiresApproval && c.approvalMode === "SPECIFIC_USERS" && !c.approvalUserIds.length) ctx.addIssue({ code: "custom", path: ["approvalUserIds"], message: "Selecione os aprovadores." });
  for (const f of c.formSchema) {
    if (f.type === "select" && !f.options.length) ctx.addIssue({ code: "custom", path: ["formSchema"], message: `Informe as opções de ${f.label}.` });
    if ((f.rules.minLen ?? 0) > (f.rules.maxLen ?? 10000) || (f.rules.min ?? -Infinity) > (f.rules.max ?? Infinity)) ctx.addIssue({ code: "custom", path: ["formSchema"], message: `Limites inválidos em ${f.label}.` });
  }
});
export type Categoria = z.infer<typeof categoriaSchema>;
export const dadosSchema = z.object({ title: z.string().trim().min(3).max(255), description: z.string().trim().min(1).max(15000), categoryId: id, requesterSectorCode: z.string().min(1).max(40), priority: z.enum(PRIORIDADES).default("MEDIA"), requestData: z.record(z.string(), z.string().max(10000)).default({}), tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]) });
export type DadosDoChamado = z.infer<typeof dadosSchema>;
// O título é da IA (27/10/2026): o rascunho nasce sem ele e a classificação o
// preenche; sem IA, sai do começo da descrição.
export const dadosRascunhoSchema = dadosSchema.extend({ title: z.string().trim().max(255).default(""), categoryId: z.string().trim().max(191).default("") });
export function tituloDaDescricao(descricao: string) {
  const linha = descricao.trim().split(/\r?\n/).find(l => l.trim())?.trim().replace(/\s+/g, " ") ?? "";
  const curto = linha.length <= 80 ? linha : `${linha.slice(0, 80).replace(/\s+\S*$/, "")}…`;
  return curto.length >= 3 ? curto : `Chamado: ${curto || "sem descrição"}`;
}
/** A pergunta em aberto é a última que o assistente fez: as perguntas do parecer vão uma por mensagem. */
export function perguntaAtual(parecer: Parecer | null, mensagens: { role: string; body: string }[]) {
  if (parecer?.status !== "needs_information") return null;
  const ultima = [...mensagens].reverse().find(m => m.role === "assistant")?.body ?? "";
  const indice = parecer.questions.findIndex(q => ultima.endsWith(q.text));
  return indice < 0 ? null : { indice, total: parecer.questions.length };
}

export function validarFormulario(dados: DadosDoChamado, categoria: Categoria, anexos: { attachmentKey: string | null; mimeType: string }[]) {
  if (!categoria.active) throw new Error("Esta categoria está desativada.");
  for (const campo of categoria.formSchema) {
    const valor = (dados.requestData[campo.key] ?? "").trim();
    if (campo.required && !valor) throw new Error(`Preencha ${campo.label}.`);
    if (!valor) continue;
    if (campo.type === "email" && !z.email().safeParse(valor).success) throw new Error(`E-mail inválido em ${campo.label}.`);
    if (campo.type === "select" && !campo.options.includes(valor)) throw new Error(`Opção inválida em ${campo.label}.`);
    if (valor.length < (campo.rules.minLen ?? 0) || valor.length > (campo.rules.maxLen ?? 10000)) throw new Error(`Confira o tamanho de ${campo.label}.`);
    if (campo.type === "number" && (!Number.isFinite(Number(valor)) || Number(valor) < (campo.rules.min ?? -Infinity) || Number(valor) > (campo.rules.max ?? Infinity))) throw new Error(`Número inválido em ${campo.label}.`);
  }
  for (const anexo of categoria.requiredAttachments) {
    const encontrados = anexos.filter(a => a.attachmentKey === anexo.key);
    if (anexo.required && !encontrados.length) throw new Error(`Anexe ${anexo.label}.`);
    if (anexo.mime.length && encontrados.some(a => !anexo.mime.some(m => m === a.mimeType || (m.endsWith("/*") && a.mimeType.startsWith(m.slice(0, -1)))))) throw new Error(`Formato incompatível em ${anexo.label}.`);
  }
}

export const coberturaSchema = z.object({ id: z.string(), name: z.string(), status: z.enum(["analyzed", "partial", "skipped", "unreadable"]), reason: z.string().max(500) });
// Pergunta com respostas prontas (28/10/2026): sim/não ou poucas alternativas
// viram botões na conversa. Pareceres gravados antes eram só o texto.
export const perguntaSchema = z.preprocess(v => typeof v === "string" ? { text: v, options: [] } : v,
  z.object({ text: z.string().min(1).max(500), options: z.array(z.string().trim().min(1).max(120)).max(5).default([]) }));
export type Pergunta = z.infer<typeof perguntaSchema>;
export const parecerSchema = z.object({ status: z.enum(["sufficient", "needs_information", "unavailable"]), summary: z.string().min(1).max(1500), questions: z.array(perguntaSchema).max(5), attachments: z.array(coberturaSchema).max(50) }).superRefine((v, ctx) => {
  if ((v.status === "sufficient" && v.questions.length) || (v.status === "needs_information" && !v.questions.length)) ctx.addIssue({ code: "custom", message: "Parecer inconsistente." });
});
export type Parecer = z.infer<typeof parecerSchema>;
export const indisponivel = (summary = "Não foi possível analisar agora. Tente novamente ou envie sem análise."): Parecer => ({ status: "unavailable", summary, questions: [], attachments: [] });
