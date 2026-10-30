// Lançar a taxa de um processo pela tela (30/10/2026).
//
// A tabela das taxas existia desde 11/09 e a ficha do processo já mostrava as
// taxas, o total e quanto custaram as voltas — mas nada criava uma taxa: só o
// robô do SIMA, que não existe ainda. O setor pagava a guia e o Connect não
// sabia. Agora a pessoa lança à mão, e quando o robô ler a guia, ele grava no
// mesmo lugar.

import { centavosDeTexto } from "@/lib/financeiro/manual";
import { lerDataDoCampo } from "./datas";

export const MAX_DESCRICAO = 160;

/** Sugestões para o campo "taxa". Campo livre: cada órgão nomeia a sua guia. */
export const TAXAS_SUGERIDAS = [
  "Taxa da Junta Comercial",
  "DAM — Meio Ambiente",
  "Taxa do Corpo de Bombeiros",
  "Taxa de Licença Sanitária",
  "Taxa de Alvará",
] as const;

export type CamposDaTaxa = {
  processId?: unknown;
  description?: unknown;
  amount?: unknown;
  dueDate?: unknown;
  protocolId?: unknown;
  paidAt?: unknown;
};

export type DadosDaTaxa = {
  processId: string;
  description: string;
  amountCents: number;
  dueDate: Date | null;
  protocolId: string | null;
  paidAt: Date | null;
};

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function lerFormularioDaTaxa(campos: CamposDaTaxa): { ok: true; dados: DadosDaTaxa } | { ok: false; erro: string } {
  const processId = texto(campos.processId);
  if (!processId) return { ok: false, erro: "Processo não informado." };

  const description = texto(campos.description);
  if (!description) return { ok: false, erro: "Diga que taxa é esta — Junta, Bombeiros, DAM…" };
  if (description.length > MAX_DESCRICAO) return { ok: false, erro: `A descrição passa de ${MAX_DESCRICAO} caracteres.` };

  const amountCents = centavosDeTexto(texto(campos.amount));
  if (amountCents === null || amountCents <= 0) return { ok: false, erro: "Informe o valor da guia, maior que zero." };

  const vencimento = lerDataDoCampo(campos.dueDate);
  if (!vencimento.ok) return { ok: false, erro: "Vencimento inválido." };
  const pagamento = lerDataDoCampo(campos.paidAt);
  if (!pagamento.ok) return { ok: false, erro: "Data do pagamento inválida." };

  return {
    ok: true,
    dados: {
      processId,
      description,
      amountCents,
      dueDate: vencimento.data,
      protocolId: texto(campos.protocolId) || null,
      paidAt: pagamento.data,
    },
  };
}
