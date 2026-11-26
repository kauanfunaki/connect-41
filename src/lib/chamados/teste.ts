// O período de teste da entrega (26/11/2026, funcionalidade-853, pedido do
// Kauan): no escritório, projeto, protótipo e sistema eram entregues e não
// eram testados. Agora quem atende, ao entregar, pode pedir o teste com um
// prazo; o chamado fica "Em teste" até quem pediu responder como foi, e cada
// passo fica registrado no histórico do chamado e na auditoria.
//
// O teste não é um fluxo à parte: é a situação EM_TESTE do chamado, que pausa
// o prazo de atendimento como as outras esperas, e sai dela pelos caminhos de
// sempre (Resolvido, Em andamento). Regras puras, compartilhadas com o
// navegador; quem grava é o comandos.ts.
import { z } from "zod";
import { isFullWrite } from "@/lib/auth/papeis";
import type { UserRole } from "@/generated/prisma/enums";
import { addDaysToKey, saoPauloDateTimeToUtc, saoPauloParts } from "@/lib/agenda";
import { somarDiasUteis } from "@/lib/solicitacoes/regras";
import { ROTULOS, emTeste, emTriagem, fechado, type PapelNoChamado, type Status } from "./regras";

/** Os atalhos do prazo, em dias úteis a partir de amanhã (o dia do pedido não conta). */
export const ATALHOS_DO_TESTE = [3, 5, 10] as const;
/** Até quantos dias corridos à frente o prazo pode ir. */
export const MAXIMO_DE_DIAS_DO_TESTE = 90;
/** Os atalhos com o dia em que cada um vence, contando os feriados do escritório (a tela mostra a data no botão). */
export function atalhosDoTeste(hojeKey: string, feriados: ReadonlySet<string>): { dias: number; ate: string }[] {
  return ATALHOS_DO_TESTE.map(dias => ({ dias, ate: somarDiasUteis(hojeKey, dias, feriados) }));
}

export const RETORNOS = ["ok", "problema", "nao_testou", "outro"] as const;
export type Retorno = (typeof RETORNOS)[number];
export const ROTULOS_DO_RETORNO: Record<Retorno, string> = { ok: "Deu tudo certo", problema: "Encontrei um problema", nao_testou: "Não consegui testar", outro: "Outro" };
/** O que o retorno faz com o chamado: conclui, volta para o atendimento ou fica em teste, com a decisão para quem atende. */
export const EFEITO_DO_RETORNO: Record<Retorno, Status | null> = { ok: "RESOLVIDO", problema: "EM_ANDAMENTO", nao_testou: null, outro: null };
/** O retorno que fica esperando quem atende decidir entre prorrogar e concluir. */
export const esperaDecisao = (retorno: string | null | undefined): retorno is "nao_testou" | "outro" => retorno === "nao_testou" || retorno === "outro";

const TEXTO_OBRIGATORIO: Record<Exclude<Retorno, "ok">, string> = {
  problema: "Descreva o problema que encontrou.",
  nao_testou: "Conte por que não conseguiu testar.",
  outro: "Conte como foi o teste.",
};
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha a data do prazo.");
export const pedidoDeTesteSchema = z.object({ ate: dia, oQueTestar: z.string().trim().max(1000).default("") });
export const prorrogacaoDoTesteSchema = z.object({ ate: dia, motivo: z.string().trim().max(1000).default("") });
export const retornoDoTesteSchema = z.object({ retorno: z.enum(RETORNOS), texto: z.string().trim().max(2000).default("") }).superRefine((r, ctx) => {
  // Só "Deu tudo certo" dispensa o texto: o resto precisa dizer o que houve.
  if (r.retorno !== "ok" && r.texto.length < 5) ctx.addIssue({ code: "custom", path: ["texto"], message: TEXTO_OBRIGATORIO[r.retorno] });
});

/** "01/12": o dia do prazo, como a tela e os avisos escrevem. */
export const diaCurto = (dateKey: string) => `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`;
/** O fim do dia escolhido em Brasília: o teste vale o dia inteiro. */
export const fimDoDia = (dateKey: string) => new Date(saoPauloDateTimeToUtc(dateKey, 23, 59).getTime() + 59_999);
/** O dia (Brasília) de um prazo gravado. */
export const diaDoPrazo = (prazo: Date | string) => saoPauloParts(new Date(prazo)).dateKey;

/** O prazo escolhido vale: de hoje até `MAXIMO_DE_DIAS_DO_TESTE` dias à frente. Devolve o erro, ou null. */
export function erroDoPrazo(dateKey: string, hojeKey: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || Number.isNaN(new Date(`${dateKey}T12:00:00Z`).getTime())) return "Escolha a data do prazo.";
  if (dateKey < hojeKey) return "O prazo do teste não pode ficar no passado.";
  if (dateKey > addDaysToKey(hojeKey, MAXIMO_DE_DIAS_DO_TESTE)) return `O prazo do teste vai até ${MAXIMO_DE_DIAS_DO_TESTE} dias à frente.`;
  return null;
}

export type EstadoDoTeste = "em_teste" | "vencido";
/** Em teste no prazo, com o prazo vencido sem retorno, ou fora do teste (null). Vencido não conclui sozinho. */
export function estadoDoTeste(chamado: { status: string; testDueAt: Date | string | null }, agora: Date): EstadoDoTeste | null {
  if (!emTeste(chamado.status) || !chamado.testDueAt) return null;
  return new Date(chamado.testDueAt) < agora ? "vencido" : "em_teste";
}
/** "Em teste até 01/12" ou "Teste vencido em 01/12". */
export function rotuloDoTeste(chamado: { status: string; testDueAt: Date | string | null }, agora: Date): string | null {
  const estado = estadoDoTeste(chamado, agora);
  if (!estado || !chamado.testDueAt) return null;
  const quando = diaCurto(diaDoPrazo(chamado.testDueAt));
  return estado === "vencido" ? `Teste vencido em ${quando}` : `Em teste até ${quando}`;
}

// ── Quem faz o quê ──────────────────────────────────────────────────────────
// Quem atende ("equipe": atende no setor do chamado e pode escrever) pede,
// prorroga e conclui; quem abriu, ou o administrador do escritório, responde.
// O servidor confere de novo ao gravar.

/** Pedir o teste: quem atende, com o chamado em atendimento, sem aprovação pendente e fora de outro teste. */
export function podePedirTeste(chamado: { status: string; approvalStatus: string }, papel: PapelNoChamado): boolean {
  return papel === "equipe" && !fechado(chamado.status) && !emTriagem(chamado.status) && !emTeste(chamado.status) && chamado.approvalStatus !== "PENDING";
}
/** Prorrogar o prazo e concluir sem retorno: quem atende, com o chamado em teste. */
export const podeConduzirTeste = (chamado: { status: string }, papel: PapelNoChamado) => papel === "equipe" && emTeste(chamado.status);
export type QuemResponde = { userId: string; role: UserRole; somenteLeitura: boolean };
/** Responder o teste: quem abriu o chamado, ou o administrador do escritório, sem acesso só de leitura. */
export function podeResponderTeste(pessoa: QuemResponde, chamado: { status: string; createdById: string }): boolean {
  if (!emTeste(chamado.status) || pessoa.somenteLeitura || pessoa.role === "READONLY") return false;
  return chamado.createdById === pessoa.userId || isFullWrite(pessoa.role);
}

// ── O que fica registrado ───────────────────────────────────────────────────
// Um evento "teste" por passo, com a ação em `acao`. Os que mudam a situação
// levam `de`/`para`, e no lugar do evento "status" (a frase do teste já diz
// para onde o chamado foi). `encerrado` é o teste que acabou por outra troca de
// situação no seletor: só histórico, quem avisa é o evento "status".
export const eventoDoTesteSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("pedido"), ate: z.string(), oQueTestar: z.string().optional(), de: z.string().optional(), para: z.string().optional() }),
  z.object({ acao: z.literal("prorrogado"), ate: z.string(), antes: z.string().optional(), motivo: z.string().optional() }),
  z.object({ acao: z.literal("retorno"), retorno: z.enum(RETORNOS), texto: z.string().optional(), de: z.string().optional(), para: z.string().optional() }),
  z.object({ acao: z.literal("concluido"), retorno: z.enum(RETORNOS).nullable().default(null), de: z.string().optional(), para: z.string().optional() }),
  z.object({ acao: z.literal("encerrado"), para: z.string() }),
  z.object({ acao: z.literal("vencido"), ate: z.string() }),
]);
export type EventoDoTeste = z.infer<typeof eventoDoTesteSchema>;
/** A situação para onde o passo levou o chamado, quando levou. */
export function situacaoDoEvento(e: EventoDoTeste): Status | null {
  return "para" in e && e.para && e.acao !== "encerrado" ? e.para as Status : null;
}

/** A frase da linha do tempo: "Ana entregou e pediu teste até 01/12". */
export function descreverEventoDoTeste(dados: unknown, quem: string): { texto: string; detalhe?: string } {
  const lido = eventoDoTesteSchema.safeParse(dados);
  if (!lido.success) return { texto: `${quem} atualizou o teste da entrega` };
  const e = lido.data;
  const detalhe = (texto?: string, prefixo = "") => texto ? { detalhe: `${prefixo}${texto}` } : {};
  switch (e.acao) {
    case "pedido": return { texto: `${quem} entregou e pediu teste até ${diaCurto(e.ate)}`, ...detalhe(e.oQueTestar, "O que testar: ") };
    case "prorrogado": return { texto: `${quem} prorrogou o teste até ${diaCurto(e.ate)}`, ...detalhe(e.motivo) };
    case "retorno": {
      const frase: Record<Retorno, string> = {
        ok: `${quem} testou: deu tudo certo, e o chamado foi concluído`,
        problema: `${quem} testou e encontrou um problema; o chamado voltou para o atendimento`,
        nao_testou: `${quem} respondeu o teste: não conseguiu testar`,
        outro: `${quem} respondeu o teste`,
      };
      return { texto: frase[e.retorno], ...detalhe(e.texto) };
    }
    case "concluido": return { texto: e.retorno ? `${quem} concluiu o chamado depois do retorno “${ROTULOS_DO_RETORNO[e.retorno]}”` : `${quem} concluiu o chamado sem retorno do teste` };
    case "encerrado": return { texto: `${quem} encerrou o teste ao passar o chamado para ${ROTULOS[e.para as Status] ?? "outra situação"}` };
    case "vencido": return { texto: `O prazo do teste (${diaCurto(e.ate)}) venceu sem retorno` };
  }
}

export type AvisoDoTeste = { mensagem: string; tipo: "CHAMADO_TESTE" | "CHAMADO_TESTE_VENCIDO" | "CHAMADO_ATUALIZADO" };
/**
 * O aviso do sino e do push de um passo do teste. Quem abriu recebe o dele
 * quando é a vez dele (testar, o prazo mudou ou venceu); a equipe, o resumo.
 * Nulo = o passo não avisa ninguém.
 */
export function avisoDoTeste(dados: unknown, titulo: string, paraQuemAbriu: boolean): AvisoDoTeste | null {
  const lido = eventoDoTesteSchema.safeParse(dados);
  if (!lido.success) return { mensagem: `Teste da entrega atualizado: ${titulo}`, tipo: "CHAMADO_ATUALIZADO" };
  const e = lido.data;
  switch (e.acao) {
    case "pedido": return paraQuemAbriu ? { mensagem: `Teste a entrega até ${diaCurto(e.ate)} e conte como foi: ${titulo}`, tipo: "CHAMADO_TESTE" } : { mensagem: `Em teste até ${diaCurto(e.ate)}: ${titulo}`, tipo: "CHAMADO_ATUALIZADO" };
    case "prorrogado": return { mensagem: `Teste prorrogado até ${diaCurto(e.ate)}: ${titulo}`, tipo: paraQuemAbriu ? "CHAMADO_TESTE" : "CHAMADO_ATUALIZADO" };
    case "retorno": return { mensagem: `Retorno do teste, ${ROTULOS_DO_RETORNO[e.retorno].toLocaleLowerCase("pt-BR")}: ${titulo}`, tipo: "CHAMADO_ATUALIZADO" };
    case "concluido": return { mensagem: `${e.retorno ? "Chamado concluído depois do teste" : "Chamado concluído sem retorno do teste"}: ${titulo}`, tipo: "CHAMADO_ATUALIZADO" };
    case "encerrado": return null;
    case "vencido": return paraQuemAbriu ? { mensagem: `O prazo do teste venceu. Conte como foi: ${titulo}`, tipo: "CHAMADO_TESTE_VENCIDO" } : { mensagem: `Teste vencido sem retorno: ${titulo}`, tipo: "CHAMADO_TESTE_VENCIDO" };
  }
}

/** O último retorno registrado no teste atual, para o bloco "Teste da entrega" (eventos do mais novo para o mais antigo). */
export function ultimoRetorno<E extends { type: string; data: unknown; actorId: string | null; createdAt: Date | string }>(eventos: E[]): { retorno: Retorno; texto: string; actorId: string | null; createdAt: Date | string } | null {
  for (const ev of eventos) {
    if (ev.type !== "teste") continue;
    const lido = eventoDoTesteSchema.safeParse(ev.data);
    if (!lido.success) continue;
    // Um pedido ou prorrogação mais novo começa outra rodada: o retorno de antes já foi decidido.
    if (lido.data.acao === "pedido" || lido.data.acao === "prorrogado") return null;
    if (lido.data.acao === "retorno") return { retorno: lido.data.retorno, texto: lido.data.texto ?? "", actorId: ev.actorId, createdAt: ev.createdAt };
  }
  return null;
}
