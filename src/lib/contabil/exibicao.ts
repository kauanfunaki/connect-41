import { formatCnpj, formatCpf, formatInstantDate, formatarCompetencia, formatarReais } from "@/lib/format";
import type { PedidoContabil } from "./types";

// Os rótulos de situação do Fiscal (ESTADO_DA_EXECUCAO, lib/fiscal/previa/doMotor),
// espelhados aqui (26/10/2026): importar de lá prenderia o Contábil ao modelo da
// prévia fiscal, que não tem "parada" e tem "cancelada".
export const ESTADO_DO_PEDIDO: Record<PedidoContabil["estado"], string> = {
  pendente: "Na fila", executando: "Executando", concluida: "Concluída", erro: "Erro", parada: "Parada",
};
export type TomDoEstado = "marca" | "sucesso" | "perigo" | "atencao" | "neutro";
const TOM: Record<PedidoContabil["estado"], TomDoEstado> = { pendente: "marca", executando: "marca", concluida: "sucesso", erro: "perigo", parada: "atencao" };
export const rotuloDoEstado = (estado: string) => ESTADO_DO_PEDIDO[estado as PedidoContabil["estado"]] ?? estado;
export const tomDoEstado = (estado: string): TomDoEstado => TOM[estado as PedidoContabil["estado"]] ?? "neutro";

/** Percentual inteiro do andamento; `null` quando ainda não há total (0 de 0). */
export function percentual({ concluidos, total }: PedidoContabil["progresso"]): number | null {
  if (!total || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((concluidos / total) * 100)));
}

/** "2026-03" → "Mar/26"; o ano inteiro ("2026") fica como veio. */
export const periodoNaTela = (periodo: string) => formatarCompetencia(periodo);

/** CNPJ ou CPF do fornecedor com máscara; vazio continua vazio (a pendência por nome não tem documento). */
export function documentoNaTela(v: string | null | undefined): string {
  const d = (v ?? "").replace(/\D/g, "");
  return !v ? "" : d.length === 11 ? formatCpf(v) : formatCnpj(v);
}

const SIGLAS = new Set(["cnpj", "cpf", "cfop", "ncm", "cst", "id", "uf", "nf", "nfe", "rpa"]);
/** "conta_debito" → "Conta debito"; siglas em caixa alta ("cnpj_fornecedor" → "CNPJ fornecedor"). */
export function rotuloDaColuna(coluna: string): string {
  const palavras = coluna.split(/[_\s]+/).filter(Boolean).map(p => SIGLAS.has(p.toLowerCase()) ? p.toUpperCase() : p.toLowerCase());
  const texto = palavras.join(" ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ehMonetario = (coluna: string) => /^valor|_valor$|^total/.test(coluna.toLowerCase());
const NUMERO = /^-?\d+(\.\d+)?$/;
/** Célula de lista do motor para leitura: moeda nas colunas de valor, datas dd/mm/aaaa, objetos em texto curto. */
export function valorDaCelula(coluna: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.length ? v.map(i => valorDaCelula(coluna, i)).join(", ") : "—";
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null && x !== "").map(([k, x]) => rotuloDaColuna(k) + ": " + valorDaCelula(k, x)).join(" · ") || "—";
  const s = String(v);
  if (ehMonetario(coluna) && (typeof v === "number" || NUMERO.test(s))) return formatarReais(Number(s));
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (data) return `${data[3]}/${data[2]}/${data[1]}`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s))) return formatInstantDate(new Date(s));
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return formatarCompetencia(s);
  if (/cnpj/i.test(coluna) && /^\d{14}$/.test(s)) return formatCnpj(s);
  return s;
}
