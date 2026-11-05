// As regras dos Contratos e assinaturas do Financeiro (05/11/2026, decisão do
// Kauan, fase 1): o que a 41 paga — softwares, serviços, aluguéis. Funções
// puras; o banco mora em `contratosServidor.ts`.

import { z } from "zod";

export const MODULO_CONTRATOS = "financeiro_contratos";

export const CATEGORIAS_DE_CONTRATO = { SOFTWARE: "Software", SERVICO: "Serviço", ALUGUEL: "Aluguel", OUTRO: "Outro" } as const;
export type CategoriaDeContrato = keyof typeof CATEGORIAS_DE_CONTRATO;

export const CICLOS = { MENSAL: "Mensal", TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual" } as const;
export type Ciclo = keyof typeof CICLOS;
const MESES_DO_CICLO: Record<Ciclo, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };

/** Quanto o contrato pesa por mês, para somar contratos de ciclos diferentes. Arredonda ao centavo. */
export function custoMensalEmCentavos(c: { amountCents: number; cycle: string; status: string }): number {
  if (c.status !== "ATIVO") return 0;
  const meses = MESES_DO_CICLO[c.cycle as Ciclo] ?? 1;
  return Math.round(c.amountCents / meses);
}

/** Avisa a renovação com esta antecedência. */
export const AVISO_DE_RENOVACAO_EM_DIAS = 30;

export type SituacaoDaRenovacao = "vencida" | "renova_em_breve" | "em_dia" | "sem_data" | "cancelado";

/** Dias de calendário entre hoje e a data (as datas do contrato são dia, sem hora). */
export function diasAteADataDoContrato(data: Date, hoje: Date): number {
  const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const hojeLocal = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  return Math.round((dia(data) - dia(hojeLocal)) / 86_400_000);
}

export function situacaoDaRenovacao(c: { status: string; renewalDate: Date | null }, hoje: Date): SituacaoDaRenovacao {
  if (c.status !== "ATIVO") return "cancelado";
  if (!c.renewalDate) return "sem_data";
  const dias = diasAteADataDoContrato(c.renewalDate, hoje);
  if (dias < 0) return "vencida";
  if (dias <= AVISO_DE_RENOVACAO_EM_DIAS) return "renova_em_breve";
  return "em_dia";
}

const data = (rotulo: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), `${rotulo} inválida.`);

/** O cadastro do contrato. `amountCents` já vem convertido do texto (ver `centavosDeTexto`). */
export const contratoSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome ao contrato.").max(160),
    supplier: z.string().trim().min(1, "Diga o fornecedor.").max(160),
    category: z.enum(["SOFTWARE", "SERVICO", "ALUGUEL", "OUTRO"], { error: "Escolha a categoria." }),
    amountCents: z.number({ error: "Valor inválido." }).int().min(0, "Valor inválido."),
    cycle: z.enum(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"], { error: "Escolha o ciclo da cobrança." }),
    startDate: data("Data de início"),
    endDate: data("Data de fim"),
    renewalDate: data("Data de renovação"),
    autoRenew: z.boolean(),
    ownerUserId: z.string().trim().optional().transform((v) => v || null),
    url: z
      .string()
      .trim()
      .max(255)
      .optional()
      .transform((v) => v || null)
      .refine((v) => v === null || /^https?:\/\//i.test(v), "O endereço começa com http:// ou https://."),
    notes: z.string().trim().max(4000).optional().transform((v) => v || null),
  })
  .refine((d) => !d.startDate || !d.endDate || d.endDate >= d.startDate, { message: "O fim vem depois do início.", path: ["endDate"] });
