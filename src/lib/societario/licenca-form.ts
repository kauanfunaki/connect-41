// Cadastro de licença pela tela.
//
// Até 15/09 não havia jeito de criar licença no Connect — a tabela existia, a
// fila de renovação existia, e só entrava licença por script. É a primeira das
// "ações básicas" que o protótipo do Societário tinha e o Connect não.

import { lerDataDoCampo } from "./datas";

export const MAX_TIPO = 120;
export const MAX_NUMERO = 80;
export const MAX_OBSERVACOES = 2000;

/**
 * Sugestões para o campo "tipo". Campo livre de propósito — cada município
 * chama a sua licença de um jeito, e o schema guarda texto pelo mesmo motivo.
 */
export const TIPOS_SUGERIDOS = [
  "Alvará de Funcionamento",
  "Licença Sanitária",
  "Autorização Ambiental de Funcionamento",
  "Certificado do Corpo de Bombeiros (CLCB)",
  "Inscrição Municipal",
] as const;

export type CamposDaLicenca = {
  companyId?: unknown;
  kind?: unknown;
  organId?: unknown;
  number?: unknown;
  issuedAt?: unknown;
  expiresAt?: unknown;
  notes?: unknown;
};

export type DadosDaLicenca = {
  companyId: string;
  kind: string;
  organId: string | null;
  number: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function lerFormularioDeLicenca(
  campos: CamposDaLicenca
): { ok: true; dados: DadosDaLicenca } | { ok: false; erro: string } {
  const companyId = texto(campos.companyId);
  if (!companyId) return { ok: false, erro: "Escolha a empresa." };

  const kind = texto(campos.kind);
  if (!kind) return { ok: false, erro: "Diga que licença é esta — alvará, sanitária, ambiental…" };
  if (kind.length > MAX_TIPO) return { ok: false, erro: `O tipo passa de ${MAX_TIPO} caracteres.` };

  const number = texto(campos.number);
  if (number.length > MAX_NUMERO) return { ok: false, erro: `O número passa de ${MAX_NUMERO} caracteres.` };

  const emissao = lerDataDoCampo(campos.issuedAt);
  if (!emissao.ok) return { ok: false, erro: "Data de emissão inválida." };
  const validade = lerDataDoCampo(campos.expiresAt);
  if (!validade.ok) return { ok: false, erro: "Data de validade inválida." };

  // Validade antes da emissão é quase sempre dia e mês trocados na digitação —
  // e uma licença gravada assim já nasceria vencida na fila de renovação.
  if (emissao.data && validade.data && validade.data < emissao.data) {
    return { ok: false, erro: "A validade não pode ser antes da emissão." };
  }

  const notes = texto(campos.notes);
  if (notes.length > MAX_OBSERVACOES) {
    return { ok: false, erro: `As observações passam de ${MAX_OBSERVACOES} caracteres.` };
  }

  return {
    ok: true,
    dados: {
      companyId,
      kind,
      organId: texto(campos.organId) || null,
      number: number || null,
      issuedAt: emissao.data,
      expiresAt: validade.data,
      notes: notes || null,
    },
  };
}
