import { z } from "zod";

export const MODULO = "helpdesk";
// "Aguardando triagem" (10/11/2026): o chamado da tela nasce nela e sai quando a
// triagem automática termina. Só a triagem tira o chamado dela — não é uma
// situação que a equipe escolhe (`SITUACOES_MANUAIS`).
export const STATUS = ["AGUARDANDO_TRIAGEM", "ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO", "AGUARDANDO_REQUERENTE", "STANDBY", "RESOLVIDO", "CANCELADO"] as const;
export type Status = (typeof STATUS)[number];
export const SITUACOES_MANUAIS = STATUS.filter(s => s !== "AGUARDANDO_TRIAGEM");
export const emTriagem = (status: string) => status === "AGUARDANDO_TRIAGEM";
export const PRIORIDADES = ["BAIXA", "MEDIA", "ALTA", "URGENTE"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export const ROTULOS: Record<Status, string> = {
  AGUARDANDO_TRIAGEM: "Aguardando triagem",
  ABERTO: "Aberto", NA_FILA: "Na fila", EM_ANDAMENTO: "Em andamento", AGUARDANDO_USUARIO: "Aguardando usuário",
  AGUARDANDO_APROVACAO: "Aguardando aprovação", AGUARDANDO_REQUERENTE: "Aguardando requerente", STANDBY: "Em espera", RESOLVIDO: "Resolvido", CANCELADO: "Cancelado",
};
export const ROTULOS_PRIORIDADE: Record<Prioridade, string> = { BAIXA: "Baixa", MEDIA: "Média", ALTA: "Alta", URGENTE: "Urgente" };
export const fechado = (status: string) => status === "RESOLVIDO" || status === "CANCELADO";
export const pausado = (status: string) => ["AGUARDANDO_USUARIO", "AGUARDANDO_APROVACAO", "AGUARDANDO_REQUERENTE", "STANDBY"].includes(status);
export const aguardandoSolicitante = (status: string) => status === "AGUARDANDO_USUARIO" || status === "AGUARDANDO_REQUERENTE";

// ── As trocas de situação que a tela oferece (18/11/2026, melhoria-782) ─────
// Não há tabela de transições: o servidor (`alterar` e `mudarStatus`, em
// comandos.ts) só barra alguns casos. Estas funções repetem as MESMAS regras,
// para o seletor não oferecer o que daria erro depois do clique; quem guarda
// continua sendo o servidor.
/** "equipe": atende no setor do chamado e pode escrever. "solicitante": o resto (quem pediu, o gestor do setor dele). */
export type PapelNoChamado = "equipe" | "solicitante";
/**
 * Para onde o chamado pode ir, sem repetir a atual:
 * - só a equipe muda a situação (`exigirOperacao`);
 * - encerrado não muda, e durante a triagem a situação é dela;
 * - "Aguardando triagem" não se escolhe;
 * - com aprovação pendente, só "Aguardando aprovação" e "Cancelado";
 * - "Aguardando aprovação" só com aprovação pendente.
 */
export function situacoesPermitidas(chamado: { status: string; approvalStatus: string }, papel: PapelNoChamado): Status[] {
  if (papel !== "equipe" || fechado(chamado.status) || emTriagem(chamado.status)) return [];
  const pendente = chamado.approvalStatus === "PENDING";
  return SITUACOES_MANUAIS.filter(s => s !== chamado.status && (pendente ? s === "AGUARDANDO_APROVACAO" || s === "CANCELADO" : s !== "AGUARDANDO_APROVACAO"));
}
/**
 * O que o seletor mostra: as permitidas, com "Aguardando usuário" e
 * "Aguardando requerente" numa opção só — no servidor as duas fazem a mesma
 * coisa (pausam o prazo e liberam a resposta de quem pediu). Fica "Aguardando
 * usuário"; o chamado que já está em "Aguardando requerente" não ganha a outra.
 * As duas continuam no banco e nas listas.
 */
export function situacoesDoSeletor(chamado: { status: string; approvalStatus: string }, papel: PapelNoChamado): Status[] {
  return situacoesPermitidas(chamado, papel).filter(s => s !== "AGUARDANDO_REQUERENTE" && !(s === "AGUARDANDO_USUARIO" && chamado.status === "AGUARDANDO_REQUERENTE"));
}

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
export const dadosSchema = z.object({ title: z.string().trim().min(3).max(255), description: z.string().trim().min(1).max(15000), categoryId: id, requesterSectorCode: z.string().min(1).max(40), priority: z.enum(PRIORIDADES).default("MEDIA"), requestData: z.record(z.string(), z.string().max(10000)).default({}), tags: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  // O setor que vai atender (12/11/2026): escolhido por quem abre, com a sugestão da IA. Vazio = o padrão do escritório.
  handlingSectorCode: z.string().trim().max(40).default("") });
export type DadosDoChamado = z.infer<typeof dadosSchema>;
// O título é da IA (27/10/2026): o rascunho nasce sem ele e a classificação o
// preenche; sem IA, sai do começo da descrição.
export const dadosRascunhoSchema = dadosSchema.extend({ title: z.string().trim().max(255).default(""), categoryId: z.string().trim().max(191).default("") });
// O título provisório pula o cumprimento (16/11/2026, bug-701): um pedido que
// começa com "Olá, bom dia!" numa linha própria ficava com esse título quando a
// IA não devolvia outro.
const CUMPRIMENTO = /^(?:(?:ol[áa]|oi+e?|opa|e a[íi]|bom dia|boa tarde|boa noite|tudo bem|tudo bom|tudo certo|como vai|prezad[oa]s?|pessoal|gente|equipe|time)(?![\p{L}\p{N}])[\s,!.?;:–—-]*)+/iu;
const encurtar = (linha: string) => {
  const curto = linha.length <= 80 ? linha : `${linha.slice(0, 80).replace(/\s+\S*$/, "")}…`;
  return curto.length >= 3 ? curto : `Chamado: ${curto || "sem descrição"}`;
};
const linhasDe = (descricao: string) => descricao.split(/\r?\n/).map(l => l.trim().replace(/\s+/g, " ")).filter(Boolean);
/** O título como saía até 16/11/2026: a primeira linha, com cumprimento e tudo. */
const tituloDaPrimeiraLinha = (descricao: string) => encurtar(linhasDe(descricao)[0] ?? "");
export function tituloDaDescricao(descricao: string) {
  const linhas = linhasDe(descricao);
  // A primeira linha que diz algo além do cumprimento; se nenhuma, a primeira como veio.
  const util = linhas.map(l => l.replace(CUMPRIMENTO, "")).find(l => /[\p{L}\p{N}]{3}/u.test(l));
  if (!util) return encurtar(linhas[0] ?? "");
  return encurtar(util[0].toLocaleUpperCase("pt-BR") + util.slice(1));
}
/** O título ainda é o provisório (o de hoje ou o de antes de 16/11/2026), e pode dar lugar ao da IA. */
export const ehTituloProvisorio = (titulo: string, descricao: string) => titulo === tituloDaDescricao(descricao) || titulo === tituloDaPrimeiraLinha(descricao);

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
// O que já existe no Ops Center (28/10/2026): a triagem aponta o robô, site ou
// app que parece atender o pedido, e quem responde por ele, antes das perguntas.
export const existenteSchema = z.object({
  ref: z.string().max(200), tipo: z.enum(["robo", "site", "app"]), nome: z.string().max(120), responsavel: z.string().max(191).nullable(),
  endereco: z.string().max(500).nullable(), noOps: z.string().max(200).nullable(), detalhe: z.string().max(210).nullable(),
  match: z.enum(["same", "similar"]), reason: z.string().max(500),
});
export type Existente = z.infer<typeof existenteSchema>;
export const ROTULOS_EXISTENTE = { robo: "robô", site: "site", app: "app" } as const;
/** A mensagem do assistente que acompanha o cartão: a mesma no servidor e na tela. */
export function mensagemDoExistente(e: Existente) {
  const inicio = e.match === "same" ? `Isso parece já existir no Orquestrador: o ${ROTULOS_EXISTENTE[e.tipo]} ${e.nome}` : `Pode ser parecido com o ${ROTULOS_EXISTENTE[e.tipo]} ${e.nome}, do Orquestrador`;
  return `${inicio}${e.responsavel ? `, de responsabilidade de ${e.responsavel}` : ""}.${e.reason ? ` ${e.reason}` : ""}`;
}

// ── Triagem depois do envio (10/11/2026) ────────────────────────────────────
// O resultado fica no evento "triagem" do chamado: o que já existe no
// Orquestrador e a categoria. Sem categoria, o motivo separa a falha (a IA não
// respondeu) da falta de contexto (respondeu sem conseguir classificar) — até
// aqui as duas saíam na mesma frase, e quem abriu não sabia qual tinha sido.
// "solicitante" (16/11/2026, funcionalidade-702): na revisão antes de abrir,
// quem abriu preferiu deixar a classificação para a equipe.
export const MOTIVOS_SEM_CATEGORIA = ["falha", "incerto", "formulario", "aprovador", "solicitante"] as const;
export type MotivoSemCategoria = (typeof MOTIVOS_SEM_CATEGORIA)[number];
export const triagemSchema = z.object({
  existente: existenteSchema.nullable().default(null),
  /** O caminho da categoria escolhida ("Desenvolvimento › Nova Automação"); nulo = A classificar. */
  categoria: z.string().max(400).nullable().default(null),
  semCategoria: z.enum(MOTIVOS_SEM_CATEGORIA).nullable().default(null),
  /** A justificativa da classificação, para a equipe. */
  justificativa: z.string().max(500).default(""),
  /** A categoria veio da revisão de quem abriu, e não da classificação da triagem (funcionalidade-702). */
  confirmadaPorQuemAbriu: z.boolean().default(false),
  /** O setor que a triagem escolheu para o chamado aberto sem a revisão (funcionalidade-709); nulo = ficou onde estava. */
  setor: z.string().max(120).nullable().default(null),
});
export type Triagem = z.infer<typeof triagemSchema>;
export type ResultadoDaTriagem = "existe" | "classificado" | "a_classificar";
/** Um resultado por aviso: o que já existe vem antes da categoria. */
export const resultadoDaTriagem = (t: Triagem): ResultadoDaTriagem => t.existente ? "existe" : t.categoria ? "classificado" : "a_classificar";
const SEM_CATEGORIA: Record<MotivoSemCategoria, string> = {
  falha: "A triagem automática falhou e não chegou a analisar o pedido. A equipe vai classificar o chamado.",
  incerto: "A triagem automática não identificou a categoria só pela descrição. A equipe vai classificar o chamado e pode pedir mais detalhes na conversa.",
  formulario: "A categoria indicada pela triagem pede informações que o pedido não tem. A equipe vai classificar o chamado e pedir o que faltar.",
  aprovador: "A categoria indicada pela triagem exige aprovação, e não há aprovador configurado. A equipe vai classificar o chamado.",
  solicitante: "Quem abriu deixou a classificação para a equipe.",
};
const classificado = (t: Triagem) => t.confirmadaPorQuemAbriu ? `Quem abriu confirmou a categoria ${t.categoria}.` : `A triagem automática classificou o chamado em ${t.categoria}.`;
/** A frase da tela do chamado, a mesma para quem abriu e para a equipe. */
export function textoDaTriagem(t: Triagem): string {
  // Com item do Orquestrador e sem categoria, a frase diz também por que não classificou (bug-701).
  if (t.existente) return `${mensagemDoExistente(t.existente)} ${t.categoria ? `O chamado foi classificado em ${t.categoria} e segue com a equipe.` : SEM_CATEGORIA[t.semCategoria ?? "falha"]}`;
  if (t.categoria) return `${classificado(t)} Ele está com a equipe.`;
  return SEM_CATEGORIA[t.semCategoria ?? "falha"];
}
/** O aviso do sino e do push para quem abriu: o resultado e o título do chamado. */
export function avisoDaTriagem(t: Triagem, titulo: string): string {
  if (t.existente) return `${t.existente.match === "same" ? "Já existe no Orquestrador" : "Pode já existir no Orquestrador"}: o ${ROTULOS_EXISTENTE[t.existente.tipo]} ${t.existente.nome}. Chamado: ${titulo}`;
  if (t.categoria) return `Triagem concluída, chamado classificado em ${t.categoria}: ${titulo}`;
  if (t.semCategoria === "solicitante") return `Triagem concluída; a equipe vai classificar o chamado: ${titulo}`;
  return `${t.semCategoria === "falha" ? "A triagem automática falhou" : "A triagem não identificou a categoria"}; a equipe vai classificar: ${titulo}`;
}

// ── Revisão antes de abrir (16/11/2026, funcionalidade-702) ─────────────────
// Depois do pedido, a IA propõe o título e a categoria e faz até três perguntas.
// A pessoa confere e abre; responder é opcional. A revisão não é uma conversa:
// é uma leitura só, e dá para abrir o chamado sem esperar por ela.
export const MAXIMO_DE_PERGUNTAS = 3;
/**
 * O que a IA propõe. `categoryId` nulo = ela não soube classificar. `setor`
 * (16/11/2026, funcionalidade-709): o setor que vai atender, com dois ou mais
 * administrando; nulo com `perguntaDoSetor` = ela ficou em dúvida e pergunta.
 */
export type RevisaoDaIa = { titulo: string; categoryId: string | null; motivo: string; tags: string[]; perguntas: Pergunta[]; setor: string | null; motivoDoSetor: string; perguntaDoSetor: string };
/**
 * O que a pessoa aprovou, gravado no rascunho (`_revisao`) para a triagem
 * respeitar: com `categoryId`, a triagem não classifica de novo; nulo é "a
 * equipe classifica".
 */
export const revisaoAprovadaSchema = z.object({ categoryId: z.string().trim().min(1).max(191).nullable(), tags: z.array(z.string().trim().min(1).max(60)).max(5).default([]) });
export type RevisaoAprovada = z.infer<typeof revisaoAprovadaSchema>;
export const respostaSchema = z.object({ pergunta: z.string().trim().min(1).max(500), resposta: z.string().trim().max(2000) });
/** O que acompanha o envio do rascunho quando a pessoa passou pela revisão. */
export const aberturaSchema = z.object({ revisao: revisaoAprovadaSchema.nullable().default(null), respostas: z.array(respostaSchema).max(MAXIMO_DE_PERGUNTAS).default([]) });
export type Abertura = z.infer<typeof aberturaSchema>;
export const TITULO_DAS_RESPOSTAS = "Respostas às perguntas da triagem:";
/**
 * A descrição do chamado com as respostas da revisão no fim, pergunta e
 * resposta, para a equipe ler junto do pedido. Sem resposta, a descrição sai
 * como foi escrita. O que passar do limite da descrição é cortado das respostas.
 */
export function descricaoComRespostas(descricao: string, respostas: { pergunta: string; resposta: string }[], limite = 15000): string {
  const dadas = respostas.map(r => ({ pergunta: r.pergunta.trim(), resposta: r.resposta.trim() })).filter(r => r.pergunta && r.resposta);
  const base = descricao.trim();
  if (!dadas.length) return base;
  const bloco = `\n\n${TITULO_DAS_RESPOSTAS}\n${dadas.map(r => `• ${r.pergunta}\n  ${r.resposta}`).join("\n")}`;
  const cabe = limite - base.length;
  return cabe < 80 ? base : `${base}${bloco.length <= cabe ? bloco : `${bloco.slice(0, cabe - 1)}…`}`;
}
/** A revisão aprovada que a triagem lê do rascunho; nula se não houve ou se o rascunho guarda outra coisa. */
export function revisaoDoRascunho(payload: unknown): RevisaoAprovada | null {
  if (!payload || typeof payload !== "object") return null;
  const r = revisaoAprovadaSchema.safeParse((payload as Record<string, unknown>)._revisao);
  return r.success ? r.data : null;
}
/** De quanto em quanto a tela do chamado confere se a triagem terminou: rápido no primeiro minuto, devagar depois. */
export const intervaloDaTriagem = (desdeMs: number) => desdeMs < 60_000 ? 3_000 : 15_000;

// O parecer da conversa com a IA (28/10 a 10/11/2026). A abertura não conversa
// mais, mas os chamados desse período guardam o parecer no rascunho, e a equipe
// o lê na tela do chamado.
export const parecerSchema = z.object({ status: z.enum(["sufficient", "needs_information", "unavailable"]), summary: z.string().min(1).max(1500), questions: z.array(perguntaSchema).max(5), attachments: z.array(coberturaSchema).max(50), existente: existenteSchema.nullable().default(null),
  // O chamado montado pela IA para a revisão (28/10/2026): descrição final, com as
  // respostas da conversa, e os anexos que seguem. A pessoa edita tudo na etapa 3.
  final: z.object({ description: z.string().min(1).max(15000), anexos: z.array(z.string().max(191)).max(50) }).nullable().default(null) }).superRefine((v, ctx) => {
  if ((v.status === "sufficient" && v.questions.length) || (v.status === "needs_information" && !v.questions.length)) ctx.addIssue({ code: "custom", message: "Parecer inconsistente." });
});
export type Parecer = z.infer<typeof parecerSchema>;

/**
 * O número do chamado que a busca da tela digitou (25/11/2026, bug-819): o id
 * curto do cartão ("chamado-45", sem diferença de maiúsculas), "#45" ou só
 * "45". `null` quando o termo não é um número de chamado — aí a busca segue só
 * no título, na descrição e no protocolo.
 */
export function numeroDaBusca(termo: string): number | null {
  const achado = /^(?:chamado-|#)?\s*([1-9][0-9]{0,9})$/i.exec(termo.trim());
  if (!achado) return null;
  const numero = Number(achado[1]);
  return numero <= 2147483647 ? numero : null;
}
