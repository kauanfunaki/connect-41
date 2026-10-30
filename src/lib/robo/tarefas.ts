// A fila do robô do Societário (30/10/2026) — a regra, sem banco.
//
// O robô roda na máquina do TI, atrás do firewall do escritório, como uma
// automação do Ops Center: a mesma chave, o mesmo sinal de vida e os mesmos
// avisos de erro da pasta de rede. Por isso é **ele que busca** a tarefa aqui —
// o Connect não alcança a máquina. Executa no portal do órgão, com o
// certificado lido do cofre na hora, e devolve só o resultado: o certificado e a
// senha nunca chegam ao Connect.
//
// ─── Os estados ─────────────────────────────────────────────────────────────
//
//   PENDENTE → EM_EXECUCAO → CONCLUIDA
//                          ↘ PRECISA_DE_GENTE   (o portal mostrou o que o robô
//                          ↘ PENDENTE de novo    não decide, ou falhou demais)
//   PENDENTE → CANCELADA                         (alguém tirou da fila)
//
// Tarefa que a máquina pegou e não devolveu em 15 minutos (a máquina caiu, o
// navegador travou) volta para a fila — mas só quando o tipo é **repetível**.
// Tipo que submete alguma coisa ao órgão nunca volta sozinho: repetir é como se
// abrem dois processos no órgão (ver `societario/executor.ts`). Hoje só existe
// tipo repetível.

import { z } from "zod";

export const STATUS_DA_TAREFA = ["PENDENTE", "EM_EXECUCAO", "CONCLUIDA", "PRECISA_DE_GENTE", "CANCELADA"] as const;
export type StatusDaTarefa = (typeof STATUS_DA_TAREFA)[number];

export const ROTULO_DO_STATUS: Record<StatusDaTarefa, string> = {
  PENDENTE: "Na fila",
  EM_EXECUCAO: "Executando",
  CONCLUIDA: "Feita",
  PRECISA_DE_GENTE: "Precisa de alguém",
  CANCELADA: "Cancelada",
};

type DefinicaoDoTipo = {
  rotulo: string;
  /** Pode rodar de novo sem efeito no órgão (só lê ou só imprime). */
  repetivel: boolean;
  /** Quantas vezes a máquina tenta antes de chamar alguém. */
  tentativas: number;
};

/**
 * O que o robô sabe fazer. Tipo novo entra aqui e no programa da máquina
 * (`scripts/robo-societario.mjs`), com o mesmo nome.
 *
 * O acompanhamento do protocolo no SIMA entra quando as três telas que faltam
 * forem levantadas com o setor (`orgaos/sima.ts`, `CONTRATO_PENDENTE`).
 */
export const TIPOS_DE_TAREFA = {
  imprimir_alvara: { rotulo: "Imprimir o alvará de Curitiba", repetivel: true, tentativas: 3 },
} as const satisfies Record<string, DefinicaoDoTipo>;

export type TipoDeTarefa = keyof typeof TIPOS_DE_TAREFA;

export function ehTipoDeTarefa(valor: string): valor is TipoDeTarefa {
  return Object.prototype.hasOwnProperty.call(TIPOS_DE_TAREFA, valor);
}

/** Tarefa pega e não devolvida depois disto é dada como perdida. */
export const PRAZO_DA_EXECUCAO_MS = 15 * 60 * 1000;

export function execucaoPerdida(pegaEm: Date | null, agora: Date): boolean {
  return pegaEm !== null && agora.getTime() - pegaEm.getTime() > PRAZO_DA_EXECUCAO_MS;
}

/**
 * A chave da tarefa aberta: uma por coisa (a licença), por tipo e escritório.
 * Fica nula quando a tarefa termina, e o índice único do banco recusa a
 * segunda aberta.
 */
export function chaveAberta(tenantId: string, tipo: TipoDeTarefa, referencia: string): string {
  return `${tenantId}:${tipo}:${referencia}`;
}

/**
 * Para onde vai a tarefa que falhou: de volta à fila ou para uma pessoa.
 *
 * - o órgão recusou (não é queda de rede nem tela que demorou): pessoa;
 * - tipo que não é repetível: pessoa, sempre;
 * - acabaram as tentativas: pessoa;
 * - senão, fila de novo.
 */
export function destinoDaFalha(p: { tipo: TipoDeTarefa; tentativas: number; recuperavel: boolean }): "PENDENTE" | "PRECISA_DE_GENTE" {
  const def: DefinicaoDoTipo = TIPOS_DE_TAREFA[p.tipo];
  if (!p.recuperavel || !def.repetivel) return "PRECISA_DE_GENTE";
  return p.tentativas >= def.tentativas ? "PRECISA_DE_GENTE" : "PENDENTE";
}

/** O que a máquina manda ao pedir trabalho: os tipos que ela sabe executar. */
export const pedidoDeTrabalhoSchema = z.object({
  capacidades: z.array(z.string().max(40)).max(20),
  /** A versão do programa da máquina, para o painel. */
  versao: z.string().max(40).optional(),
});

export function capacidadesConhecidas(capacidades: readonly string[]): TipoDeTarefa[] {
  return [...new Set(capacidades.filter(ehTipoDeTarefa))];
}

/**
 * O que a máquina devolve. `recuperavel` separa "o site caiu, tente de novo"
 * de "o órgão mostrou algo que precisa de gente" — o mesmo corte do executor.
 */
export const devolucaoSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), resultado: z.record(z.string(), z.unknown()) }),
  z.object({ ok: z.literal(false), motivo: z.string().trim().min(1).max(500), recuperavel: z.boolean() }),
]);

export type Devolucao = z.infer<typeof devolucaoSchema>;
