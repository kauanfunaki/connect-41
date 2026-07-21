// Import de folha via CSV — mapeia colunas por nome de cabeçalho (tolerante a
// acento/maiúscula/pontuação, ver normalizeHeader) em vez de posição, porque
// planilhas de RH/contabilidade raramente mantêm a mesma ordem de colunas.
// Só a coluna de CPF (chave de casamento com o Colaborador) e Salário Bruto
// são obrigatórias — o resto é opcional, igual ao lançamento manual.
import { normalizeHeader, parseCsv } from "./csv";

export type ParsedPayrollRow = {
  rowNumber: number; // 1-based, contando a linha de cabeçalho como linha 1
  cpf: string;
  grossSalary: string | null;
  workedDays: number | null;
  vacationDays: number | null;
  missedDays: number | null;
  absenceDays: number | null;
  overtimeHours: string | null;
  thirteenthSalary: string | null;
  familyAllowance: string | null;
  nightShiftAllowance: string | null;
  hazardPay: string | null;
  unhealthyPay: string | null;
  benefitsTotal: string | null;
  deductions: string | null;
  notes: string | null;
};

type FieldKind = "cpf" | "decimal" | "int" | "text";

const COLUMN_ALIASES: Record<keyof Omit<ParsedPayrollRow, "rowNumber">, string[]> = {
  cpf: ["cpf"],
  grossSalary: ["salariobruto", "salario", "bruto"],
  workedDays: ["diastrabalhados"],
  vacationDays: ["diasdeferias", "diasferias", "ferias"],
  missedDays: ["faltas"],
  absenceDays: ["diasdeafastamento", "diasafastamento", "afastamento", "afastamentos"],
  overtimeHours: ["horasextras", "horaextra"],
  thirteenthSalary: ["13salario", "decimoterceiro", "decimoterceirosalario"],
  familyAllowance: ["salariofamilia"],
  nightShiftAllowance: ["adicionalnoturno"],
  hazardPay: ["periculosidade"],
  unhealthyPay: ["insalubridade"],
  benefitsTotal: ["beneficios"],
  deductions: ["descontos"],
  notes: ["observacoes", "obs", "observacao"],
};

const FIELD_KIND: Record<keyof Omit<ParsedPayrollRow, "rowNumber">, FieldKind> = {
  cpf: "cpf",
  grossSalary: "decimal",
  workedDays: "int",
  vacationDays: "int",
  missedDays: "int",
  absenceDays: "int",
  overtimeHours: "decimal",
  thirteenthSalary: "decimal",
  familyAllowance: "decimal",
  nightShiftAllowance: "decimal",
  hazardPay: "decimal",
  unhealthyPay: "decimal",
  benefitsTotal: "decimal",
  deductions: "decimal",
  notes: "text",
};

// Converte número em formato pt-BR ("1.234,56") ou já em formato "de máquina"
// ("1234.56") para string decimal aceita pelo Prisma (Decimal). Retorna null
// para vazio/ilegível — decisão consciente de não travar a linha inteira por
// causa de um único campo opcional inválido (só CPF/Salário Bruto travam).
export function parseBrDecimal(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let cleaned = trimmed.replace(/[^0-9.,-]/g, "");
  if (cleaned.includes(",")) {
    // vírgula presente: assume que é o separador decimal pt-BR, pontos são milhar.
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  }

  return Number.isFinite(Number(cleaned)) && cleaned !== "" ? cleaned : null;
}

export function parseIntCell(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

export type PayrollCsvParseResult = {
  rows: ParsedPayrollRow[];
  // Erros que impedem qualquer processamento (ex: cabeçalho sem CPF/Salário Bruto).
  fatalError: string | null;
};

export function parsePayrollCsv(text: string): PayrollCsvParseResult {
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0) {
    return { rows: [], fatalError: "Arquivo vazio ou sem cabeçalho." };
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const columnIndex = new Map<keyof Omit<ParsedPayrollRow, "rowNumber">, number>();
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [keyof Omit<ParsedPayrollRow, "rowNumber">, string[]][]) {
    const idx = normalizedHeaders.findIndex((h) => aliases.includes(h));
    if (idx !== -1) columnIndex.set(field, idx);
  }

  if (!columnIndex.has("cpf")) {
    return { rows: [], fatalError: 'Coluna "CPF" não encontrada no cabeçalho do CSV.' };
  }
  if (!columnIndex.has("grossSalary")) {
    return { rows: [], fatalError: 'Coluna "Salário Bruto" não encontrada no cabeçalho do CSV.' };
  }

  const parsedRows: ParsedPayrollRow[] = rows.map((cells, i) => {
    const get = (field: keyof Omit<ParsedPayrollRow, "rowNumber">): string | undefined => {
      const idx = columnIndex.get(field);
      return idx === undefined ? undefined : cells[idx];
    };

    const value = <F extends keyof Omit<ParsedPayrollRow, "rowNumber">>(field: F): ParsedPayrollRow[F] => {
      const raw = get(field);
      const kind = FIELD_KIND[field];
      if (kind === "int") return parseIntCell(raw) as ParsedPayrollRow[F];
      if (kind === "decimal") return parseBrDecimal(raw) as ParsedPayrollRow[F];
      if (kind === "text") return (raw?.trim() || null) as ParsedPayrollRow[F];
      return (raw?.trim() ?? "") as ParsedPayrollRow[F];
    };

    return {
      rowNumber: i + 2, // +1 pelo cabeçalho, +1 porque rowNumber é 1-based
      cpf: value("cpf"),
      grossSalary: value("grossSalary"),
      workedDays: value("workedDays"),
      vacationDays: value("vacationDays"),
      missedDays: value("missedDays"),
      absenceDays: value("absenceDays"),
      overtimeHours: value("overtimeHours"),
      thirteenthSalary: value("thirteenthSalary"),
      familyAllowance: value("familyAllowance"),
      nightShiftAllowance: value("nightShiftAllowance"),
      hazardPay: value("hazardPay"),
      unhealthyPay: value("unhealthyPay"),
      benefitsTotal: value("benefitsTotal"),
      deductions: value("deductions"),
      notes: value("notes"),
    };
  });

  return { rows: parsedRows, fatalError: null };
}
