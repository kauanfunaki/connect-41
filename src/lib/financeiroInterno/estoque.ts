// As regras do Estoque do Financeiro (05/11/2026, decisão do Kauan, fase 1):
// máquinas e materiais do escritório. Funções puras; o banco mora em
// `estoqueServidor.ts`.
//
// Dois tipos de item:
// - patrimônio: uma coisa só, com número (notebook, monitor, cadeira). Tem
//   situação e "com quem está";
// - material: quantidade (papel, toner, cabo). Entra, sai, tem mínimo para
//   repor.

import { z } from "zod";

export const MODULO_ESTOQUE = "financeiro_estoque";

export const TIPOS_DE_ITEM = { patrimonio: "Patrimônio", material: "Material" } as const;
export type TipoDeItem = keyof typeof TIPOS_DE_ITEM;

export const SITUACOES = {
  DISPONIVEL: "Disponível",
  EM_USO: "Em uso",
  EMPRESTADO: "Emprestado",
  MANUTENCAO: "Em manutenção",
  BAIXADO: "Baixado",
} as const;
export type SituacaoDoItem = keyof typeof SITUACOES;

export const MOVIMENTOS = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
  ENTREGA: "Entregar para uso",
  EMPRESTIMO: "Emprestar",
  DEVOLUCAO: "Devolver",
  MANUTENCAO: "Mandar para manutenção",
  BAIXA: "Dar baixa",
  CONFERENCIA: "Conferir",
} as const;
export type TipoDeMovimento = keyof typeof MOVIMENTOS;

/** Os movimentos que cada tipo de item aceita. */
export function movimentosDoItem(item: { kind: string; status: string }): TipoDeMovimento[] {
  if (item.status === "BAIXADO") return [];
  if (item.kind === "material") return ["ENTRADA", "SAIDA", "BAIXA", "CONFERENCIA"];
  const lista: TipoDeMovimento[] = [];
  if (item.status === "DISPONIVEL") lista.push("ENTREGA", "EMPRESTIMO", "MANUTENCAO");
  else lista.push("DEVOLUCAO");
  lista.push("BAIXA", "CONFERENCIA");
  return lista;
}

export type ItemParaMovimento = { kind: string; status: string; quantity: number; holderUserId: string | null; holderName: string | null; location: string | null };
export type Movimento = { tipo: TipoDeMovimento; quantidade?: number; holderUserId?: string | null; holderName?: string | null; location?: string | null };

/**
 * O item depois do movimento, ou o erro que a tela mostra. A conferência
 * (inventário) acerta a quantidade contada no material e só registra a data no
 * patrimônio.
 */
export function aplicarMovimento(item: ItemParaMovimento, mov: Movimento): { erro: string } | { item: ItemParaMovimento } {
  if (!movimentosDoItem(item).includes(mov.tipo)) {
    return { erro: item.status === "BAIXADO" ? "Item baixado não se movimenta." : `“${MOVIMENTOS[mov.tipo]}” não vale para este item agora.` };
  }
  const q = mov.quantidade ?? 0;
  const local = mov.location?.trim() || item.location;
  switch (mov.tipo) {
    case "ENTRADA":
      if (!Number.isInteger(q) || q <= 0) return { erro: "Informe quantos entraram." };
      return { item: { ...item, quantity: item.quantity + q, location: local } };
    case "SAIDA":
      if (!Number.isInteger(q) || q <= 0) return { erro: "Informe quantos saíram." };
      if (q > item.quantity) return { erro: `Só há ${item.quantity} em estoque.` };
      return { item: { ...item, quantity: item.quantity - q } };
    case "ENTREGA":
    case "EMPRESTIMO": {
      const nome = mov.holderName?.trim();
      if (!mov.holderUserId && !nome) return { erro: "Diga com quem o item vai ficar." };
      return { item: { ...item, status: mov.tipo === "ENTREGA" ? "EM_USO" : "EMPRESTADO", holderUserId: mov.holderUserId ?? null, holderName: nome || null, location: local } };
    }
    case "DEVOLUCAO":
      return { item: { ...item, status: "DISPONIVEL", holderUserId: null, holderName: null, location: local } };
    case "MANUTENCAO":
      return { item: { ...item, status: "MANUTENCAO", holderUserId: null, holderName: null, location: local } };
    case "BAIXA":
      if (item.kind === "material") {
        if (!Number.isInteger(q) || q <= 0) return { erro: "Informe quantos foram descartados." };
        if (q > item.quantity) return { erro: `Só há ${item.quantity} em estoque.` };
        return { item: { ...item, quantity: item.quantity - q } };
      }
      return { item: { ...item, status: "BAIXADO", quantity: 0, holderUserId: null, holderName: null } };
    case "CONFERENCIA":
      if (item.kind === "material") {
        if (!Number.isInteger(q) || q < 0) return { erro: "Informe quantos foram contados." };
        return { item: { ...item, quantity: q, location: local } };
      }
      return { item: { ...item, location: local } };
  }
}

/** Material abaixo do mínimo (o aviso de reposição). */
export function abaixoDoMinimo(item: { kind: string; status: string; quantity: number; minQuantity: number | null }): boolean {
  return item.kind === "material" && item.status !== "BAIXADO" && item.minQuantity !== null && item.quantity < item.minQuantity;
}

/** Dias sem conferência para o item entrar em "a conferir". */
export const CONFERIR_A_CADA_DIAS = 180;

export function precisaConferir(item: { status: string; lastCheckedAt: Date | null; createdAt: Date }, hoje: Date, dias = CONFERIR_A_CADA_DIAS): boolean {
  if (item.status === "BAIXADO") return false;
  const base = item.lastCheckedAt ?? item.createdAt;
  return hoje.getTime() - base.getTime() >= dias * 86_400_000;
}

const texto = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));

/** O cadastro do item (novo ou edição). Quantidade e situação mudam por movimento, não aqui. */
export const itemSchema = z
  .object({
    kind: z.enum(["patrimonio", "material"], { error: "Escolha patrimônio ou material." }),
    name: z.string().trim().min(1, "Dê um nome ao item.").max(160),
    category: z.string().trim().min(1, "Escolha ou escreva a categoria.").max(80),
    assetTag: texto(60),
    serialNumber: texto(120),
    location: texto(120),
    unit: z.string().trim().max(20).optional().transform((v) => v || "un"),
    quantity: z.coerce.number().int().min(0).optional(),
    minQuantity: z
      .union([z.literal(""), z.coerce.number().int().min(0)])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    purchaseDate: z
      .string()
      .optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data de compra inválida."),
    supplier: texto(160),
    notes: texto(4000),
  })
  .transform((d) => ({ ...d, assetTag: d.kind === "patrimonio" ? d.assetTag : null, minQuantity: d.kind === "material" ? d.minQuantity : null }));

/** As categorias que a tela sugere; dá para escrever outra. */
export const CATEGORIAS_SUGERIDAS = ["Computadores", "Monitores", "Periféricos", "Celulares", "Rede", "Mobiliário", "Material de escritório", "Limpeza", "Copa"] as const;
