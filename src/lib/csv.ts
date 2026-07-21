// Parser de CSV genérico e minimalista (sem dependência externa) — cobre o que
// planilhas exportadas de Excel/Google Sheets realmente produzem: aspas com
// campos escapados (""), delimitador vírgula OU ponto-e-vírgula (comum em
// exports pt-BR), CRLF/LF e BOM no início do arquivo.

export type CsvParseResult = { headers: string[]; rows: string[][] };

export function parseCsv(text: string): CsvParseResult {
  const stripped = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(stripped);
  const allRows = tokenizeRows(stripped, delimiter);
  const nonEmpty = allRows.filter((r) => r.some((c) => c.trim() !== ""));
  const [headers, ...rows] = nonEmpty;
  return { headers: headers ?? [], rows };
}

function detectDelimiter(text: string): "," | ";" {
  const firstLine = text.split(/\r\n|\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}

function tokenizeRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // ignorado — CRLF é tratado no \n abaixo
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Normaliza um cabeçalho para comparação tolerante a acento/maiúscula/espaço/pontuação.
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
