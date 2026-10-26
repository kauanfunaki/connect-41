import { z } from "zod";

export const MODULO_TECH_INTERNO = "tech_controle_interno";
export const ROTA_TECH_INTERNO = "/tech/controle-interno";
export const TAMANHO_PAGINA = 50;
export const TIPOS = { BUG: "Bug", IMPROVEMENT: "Melhoria", FEATURE: "Nova funcionalidade", TEST: "Teste", MIGRATION: "Migração" } as const;
export const SITUACOES = { PENDING: "Pendente", IN_PROGRESS: "Em andamento", VALIDATION: "Em validação", DONE: "Concluído", CANCELED: "Cancelado" } as const;
export const PRIORIDADES = ["Baixa", "Média", "Alta", "Urgente"] as const;
export const EM_ABERTO = ["PENDING", "IN_PROGRESS", "VALIDATION"] as const;
export const CONFLITO = "Este registro foi alterado por outra pessoa. Atualize a página e confira antes de salvar.";

const opcional = (max: number) => z.string({ error: "Texto inválido." }).trim().max(max, `O campo deve ter até ${max} caracteres.`).nullish().transform(v => v || null);
const idOpcional = opcional(191);
const dia = z.iso.date({ error: "Informe uma data válida." }).refine(v => v >= "1900-01-01" && v <= "9999-12-31", "Data inválida.");
export const itemSchema = z.object({
  title: z.string().trim().min(1, "Informe o título.").max(200, "O título deve ter até 200 caracteres."),
  description: opcional(10000),
  type: z.enum(["BUG", "IMPROVEMENT", "FEATURE", "TEST", "MIGRATION"], { error: "Escolha o tipo." }),
  priority: z.coerce.number({ error: "Prioridade inválida." }).int("Prioridade inválida.").min(0, "Prioridade inválida.").max(3, "Prioridade inválida.").default(1),
  status: z.enum(["PENDING", "IN_PROGRESS", "VALIDATION", "DONE", "CANCELED"], { error: "Situação inválida." }).default("PENDING"),
  systemMode: z.enum(["NONE", "EXISTING", "NEW"], { error: "Escolha uma opção de sistema válida." }).default("NONE"),
  toolId: idOpcional,
  assigneeId: idOpcional,
  dueDate: z.union([dia, z.literal(""), z.null()], { error: "Informe uma data válida." }).optional().transform(v => v || null),
}).superRefine((v, ctx) => {
  if (v.systemMode === "EXISTING" && !v.toolId) ctx.addIssue({ code: "custom", path: ["toolId"], message: "Escolha um sistema cadastrado." });
  if (v.systemMode !== "EXISTING" && v.toolId) ctx.addIssue({ code: "custom", path: ["toolId"], message: "Esta opção não permite um sistema cadastrado." });
});
export type DadosItem = z.infer<typeof itemSchema>;
export const versaoSchema = z.coerce.number().int().min(0);
export const comentarioSchema = z.string().trim().min(1, "Escreva o comentário.").max(5000, "O comentário deve ter até 5.000 caracteres.");
export const sistemaSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do sistema.").max(120, "O nome deve ter até 120 caracteres.").transform(v => v.replace(/\s+/g, " ")),
  active: z.boolean(),
});

const filtroEnum = <T extends string>(valores: readonly T[], valor: string | undefined): T | undefined => valores.includes(valor as T) ? valor as T : undefined;
export function lerFiltros(params: Record<string, string | string[] | undefined>) {
  const texto = (chave: string) => typeof params[chave] === "string" ? params[chave] as string : undefined;
  const p = Number(texto("page") ?? texto("pagina"));
  return {
    q: (texto("q") ?? "").trim().slice(0, 200),
    status: filtroEnum([...Object.keys(SITUACOES), "ALL"], texto("situacao")),
    type: filtroEnum(Object.keys(TIPOS) as (keyof typeof TIPOS)[], texto("tipo")),
    priority: filtroEnum(["0", "1", "2", "3"], texto("prioridade")),
    system: texto("sistema")?.slice(0, 191),
    assignee: texto("responsavel")?.slice(0, 191),
    overdue: texto("atrasados") === "1",
    page: Number.isInteger(p) && p > 0 ? Math.min(p, 1000000) : 1,
    view: filtroEnum(["lista", "kanban", "agenda"] as const, texto("visao")) ?? "lista",
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(texto("mes") ?? "") && Number(texto("mes")?.slice(0, 4)) >= 1900 && Number(texto("mes")?.slice(0, 4)) <= 9998 ? texto("mes")! : hojeEmSaoPaulo().slice(0, 7),
  };
}
export type Filtros = ReturnType<typeof lerFiltros>;
// O "Voltar para a lista" volta ao recorte de onde a pessoa saiu — visão, filtros
// e página (26/10/2026). Só aceita a própria lista; o resto cai na lista limpa.
export function destinoDeVolta(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2000 || /[\\\s]|\/\//.test(raw)) return ROTA_TECH_INTERNO;
  return raw === ROTA_TECH_INTERNO || raw.startsWith(`${ROTA_TECH_INTERNO}?`) ? raw : ROTA_TECH_INTERNO;
}
export function comVolta(href: string, voltar: string) {
  return voltar === ROTA_TECH_INTERNO ? href : `${href}${href.includes("?") ? "&" : "?"}voltar=${encodeURIComponent(voltar)}`;
}
export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export type Alteracao = { field: string; before: string | null; after: string | null };
export function diferencas(antes: Record<string, string | null> | null, depois: Record<string, string | null>): Alteracao[] {
  return Object.entries(depois).filter(([campo, valor]) => !antes || antes[campo] !== valor)
    .map(([field, after]) => ({ field, before: antes?.[field] ?? null, after }));
}
