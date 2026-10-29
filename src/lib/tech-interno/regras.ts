import { z } from "zod";

export const MODULO_TECH_INTERNO = "tech_controle_interno";
export const ROTA_TECH_INTERNO = "/tech/controle-interno";
// Clicar em qualquer ponto da linha ou do cartão abre o item (29/10/2026): o
// link do título se estica sobre o contêiner (que precisa ser `relative`). Só a
// situação, uma camada acima, continua mudando ali mesmo.
export const LINK_DO_ITEM = "after:absolute after:inset-0 after:content-['']";
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
  systemKey: idOpcional,
  assigneeId: idOpcional,
  dueDate: z.union([dia, z.literal(""), z.null()], { error: "Informe uma data válida." }).optional().transform(v => v || null),
}).superRefine((v, ctx) => {
  if (v.systemMode === "EXISTING" && !vinculoDoSistema(v.systemKey)) ctx.addIssue({ code: "custom", path: ["systemKey"], message: "Escolha um sistema do Ops Center." });
  if (v.systemMode !== "EXISTING" && v.systemKey) ctx.addIssue({ code: "custom", path: ["systemKey"], message: "Esta opção não permite um sistema cadastrado." });
});
export type DadosItem = z.infer<typeof itemSchema>;
export const versaoSchema = z.coerce.number().int().min(0);
export const comentarioSchema = z.string().trim().min(1, "Escreva o comentário.").max(5000, "O comentário deve ter até 5.000 caracteres.");

// O sistema de um item vem do Ops Center (29/10/2026): o mesmo cadastro de robôs,
// sites e apps, sem um segundo cadastro aqui. A chave diz de onde ele vem; "tool"
// é o cadastro próprio anterior, aceito só para manter um vínculo já gravado.
export const ORIGENS_DO_SISTEMA = { robo: "Robôs", site: "Sites", app: "Apps", tool: "Cadastro anterior" } as const;
export type OrigemDoSistema = keyof typeof ORIGENS_DO_SISTEMA;
export type SistemaTech = { chave: string; nome: string; origem: OrigemDoSistema; ativo: boolean };
export type VinculoDoSistema = { opsWatcherSlug: string | null; opsSiteId: string | null; opsAppId: string | null; toolId: string | null };
export const SEM_VINCULO: VinculoDoSistema = { opsWatcherSlug: null, opsSiteId: null, opsAppId: null, toolId: null };
const COLUNA_DA_ORIGEM = { robo: "opsWatcherSlug", site: "opsSiteId", app: "opsAppId", tool: "toolId" } as const;
export function vinculoDoSistema(chave: string | null | undefined): VinculoDoSistema | null {
  const [, origem, ref] = /^(robo|site|app|tool):(.{1,185})$/.exec(chave ?? "") ?? [];
  return origem ? { ...SEM_VINCULO, [COLUNA_DA_ORIGEM[origem as OrigemDoSistema]]: ref } : null;
}
export function chaveDoSistema(v: VinculoDoSistema): string | null {
  const origem = (Object.keys(COLUNA_DA_ORIGEM) as OrigemDoSistema[]).find(o => v[COLUNA_DA_ORIGEM[o]]);
  return origem ? `${origem}:${v[COLUNA_DA_ORIGEM[origem]]}` : null;
}
export function nomeDoSistema(item: { systemMode: string; tool?: { name: string; active: boolean } | null; opsWatcher?: { name: string; isActive: boolean } | null; opsSite?: { name: string; isActive: boolean } | null; opsApp?: { name: string; isActive: boolean } | null }, marcarInativo = false) {
  if (item.systemMode === "NEW") return "Novo sistema";
  if (item.systemMode === "NONE") return "Sem sistema";
  const ops = item.opsWatcher ?? item.opsSite ?? item.opsApp;
  const nome = ops?.name ?? item.tool?.name, ativo = ops ? ops.isActive : item.tool?.active;
  return nome ? `${nome}${marcarInativo && !ativo ? " (inativo)" : ""}` : "Sistema indisponível";
}

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

// O histórico conta quem fez o quê em frase (26/10/2026): "trocou o responsável
// de Ana para Bruno", em vez de "Responsável: Ana → Bruno".
const ARTIGO: Record<string, string> = { "Situação": "a situação", "Tipo": "o tipo", "Prioridade": "a prioridade", "Sistema": "o sistema" };
export const diaLegivel = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v;
export function fraseDaAlteracao({ field, before, after }: Alteracao, criacao = false): string {
  const antes = before && diaLegivel(before), depois = after && diaLegivel(after);
  if (criacao) return `${field}: ${field === "Descrição" ? "preenchida" : depois ?? "não informado"}`;
  if (field === "Vínculo do sistema") return "trocou o sistema por outro com o mesmo nome";
  if (field === "Vínculo do responsável") return "trocou o responsável por outra pessoa com o mesmo nome";
  if (field === "Título") return `renomeou de “${antes ?? ""}” para “${depois ?? ""}”`;
  if (field === "Descrição") return !antes ? "adicionou a descrição" : !depois ? "removeu a descrição" : "editou a descrição";
  if (field === "Responsável") return !antes ? `definiu o responsável: ${depois}` : !depois ? `removeu o responsável (${antes})` : `trocou o responsável de ${antes} para ${depois}`;
  if (field === "Prazo") return !antes ? `definiu o prazo para ${depois}` : !depois ? `removeu o prazo (era ${antes})` : `mudou o prazo de ${antes} para ${depois}`;
  return `mudou ${ARTIGO[field] ?? field.toLowerCase()} de ${antes ?? "não informado"} para ${depois ?? "não informado"}`;
}

// O histórico do módulo agrupa por dia e mostra a hora, no fuso de São Paulo
// (29/10/2026): "Hoje", "Ontem" e, antes disso, o dia por extenso.
const FUSO = "America/Sao_Paulo";
export function diaDoRegistro(quando: Date, agora = new Date()) {
  const dia = hojeEmSaoPaulo(quando), hoje = hojeEmSaoPaulo(agora);
  const ontem = hojeEmSaoPaulo(new Date(new Date(`${hoje}T12:00:00Z`).getTime() - 864e5));
  const rotulo = dia === hoje ? "Hoje" : dia === ontem ? "Ontem" : new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO, weekday: "long", day: "numeric", month: "long", ...(dia.slice(0, 4) !== hoje.slice(0, 4) ? { year: "numeric" } : {}),
  }).format(quando);
  return { chave: dia, rotulo: rotulo.charAt(0).toUpperCase() + rotulo.slice(1) };
}
export const horaDoRegistro = (quando: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }).format(quando);
