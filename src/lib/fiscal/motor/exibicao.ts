import { formatCnpj, formatInstantDate, formatarCompetencia, formatarReais } from "@/lib/format";

// Leitura dos dados crus do motor nas tabelas livres do Fiscal (auditoria de UX,
// 30/10/2026): cabeçalho legível e células formatadas, no lugar das chaves do
// motor e do `JSON.stringify`. Nasceu no Contábil (26/10, `lib/contabil/exibicao`)
// e veio para cá quando o Contábil foi refeito sobre a tabela dele.

const SIGLAS = new Set(["cnpj", "cpf", "cfop", "ncm", "cst", "id", "uf", "nf", "nfe", "rpa"]);

/** "conta_debito" → "Conta debito"; siglas em caixa alta ("cnpj_fornecedor" → "CNPJ fornecedor"). */
export function rotuloDaColuna(coluna: string): string {
  const palavras = coluna
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => (SIGLAS.has(p.toLowerCase()) ? p.toUpperCase() : p.toLowerCase()));
  const texto = palavras.join(" ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const ehMonetario = (coluna: string) => /^valor|_valor$|^total/.test(coluna.toLowerCase());
const NUMERO = /^-?\d+(\.\d+)?$/;

/** Célula para leitura: moeda nas colunas de valor, datas dd/mm/aaaa, competência, CNPJ, objetos em texto curto. */
export function valorDaCelula(coluna: string, v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (Array.isArray(v)) return v.length ? v.map((i) => valorDaCelula(coluna, i)).join(", ") : "—";
  if (typeof v === "object") {
    return (
      Object.entries(v as Record<string, unknown>)
        .filter(([, x]) => x != null && x !== "")
        .map(([k, x]) => rotuloDaColuna(k) + ": " + valorDaCelula(k, x))
        .join(" · ") || "—"
    );
  }
  const s = String(v);
  if (ehMonetario(coluna) && (typeof v === "number" || NUMERO.test(s))) return formatarReais(Number(s));
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (data) return `${data[3]}/${data[2]}/${data[1]}`;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s))) return formatInstantDate(new Date(s));
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(s)) return formatarCompetencia(s);
  if (/cnpj/i.test(coluna) && /^\d{14}$/.test(s)) return formatCnpj(s);
  return s;
}
