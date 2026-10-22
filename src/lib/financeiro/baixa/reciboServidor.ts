import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { formatCnpj, formatCpf, formatDocumento } from "@/lib/format";
import { centavosDeDecimal } from "../contas";
import { nomeDaContaBancaria } from "../contaPrevista";
import { numeroDoRecibo, pdfDoRecibo, type DadosDoRecibo } from "./recibo";

// O recibo da baixa servido por duas portas (22/10/2026): a da equipe
// (`/api/financeiro/baixas/[id]/recibo`) e a do cliente no portal
// (`/portal/pagar/recibos/[id]` e `/portal/receber/recibos/[id]`). Cada rota
// confere o próprio acesso e lê a baixa com o próprio `where`; daqui saem o
// `select`, a montagem dos dados e o PDF — o mesmo papel nas duas.

/** O que o recibo lê da baixa. */
export const SELECT_DO_RECIBO = {
  id: true,
  companyId: true,
  paidAt: true,
  principal: true,
  interest: true,
  fine: true,
  discount: true,
  cash: true,
  note: true,
  origin: true,
  createdAt: true,
  tenant: { select: { name: true } },
  company: { select: { name: true, displayName: true, kind: true, cnpj: true, cpf: true } },
  bankAccount: { select: { nickname: true, accountNumber: true, type: true } },
  createdBy: { select: { name: true } },
  entry: {
    select: {
      kind: true,
      amount: true,
      dueDate: true,
      description: true,
      documentNumber: true,
      counterparty: { select: { name: true, document: true } },
    },
  },
} satisfies Prisma.FinanceEntryPaymentSelect;

export type BaixaDoRecibo = Prisma.FinanceEntryPaymentGetPayload<{ select: typeof SELECT_DO_RECIBO }>;

const ORIGEM_SEM_PESSOA: Record<string, string> = {
  OMIE: "Leitura do Omie",
  MIGRACAO: "Migração de 19/10",
};

/** CPF ou CNPJ da contraparte, que é guardado só com os dígitos. */
function documentoDaContraparte(d: string | null): string | null {
  if (!d) return null;
  return d.length === 11 ? formatCpf(d) : formatCnpj(d);
}

/**
 * Os dados do papel. `paraOPortal`: a observação da baixa fica de fora — é o
 * campo livre da equipe ("pago com atraso, juros do boleto", "conferir com o
 * Fulano"), escrito para o escritório e não para o cliente. Quem registrou e
 * quando ficam: é a mesma informação que a equipe já assina no papel.
 */
export function dadosDoRecibo(baixa: BaixaDoRecibo, opcoes: { paraOPortal?: boolean } = {}): DadosDoRecibo {
  const documentoDaEmpresa = formatDocumento(baixa.company.kind, baixa.company.cnpj, baixa.company.cpf);
  return {
    paymentId: baixa.id,
    kind: baixa.entry.kind,
    escritorioNome: baixa.tenant.name,
    empresaNome: nomeExibicao(baixa.company),
    empresaDocumento: documentoDaEmpresa === "—" ? null : documentoDaEmpresa,
    contraparteNome: baixa.entry.counterparty.name,
    contraparteDocumento: documentoDaContraparte(baixa.entry.counterparty.document),
    descricao: baixa.entry.description,
    documentoNumero: baixa.entry.documentNumber,
    vencimentoKey: saoPauloParts(baixa.entry.dueDate).dateKey,
    pagamentoKey: saoPauloParts(baixa.paidAt).dateKey,
    valorDoTituloCentavos: centavosDeDecimal(baixa.entry.amount),
    principalCentavos: centavosDeDecimal(baixa.principal),
    jurosCentavos: centavosDeDecimal(baixa.interest),
    multaCentavos: centavosDeDecimal(baixa.fine),
    descontoCentavos: centavosDeDecimal(baixa.discount),
    caixaCentavos: centavosDeDecimal(baixa.cash),
    contaBancaria: baixa.bankAccount ? nomeDaContaBancaria(baixa.bankAccount) : null,
    observacao: opcoes.paraOPortal ? null : baixa.note,
    registradoPor: baixa.createdBy?.name ?? ORIGEM_SEM_PESSOA[baixa.origin] ?? null,
    registradoEm: baixa.createdAt,
    emitidoEm: new Date(),
  };
}

/** O PDF como download, com o número do recibo no nome do arquivo. */
export async function respostaDoRecibo(dados: DadosDoRecibo): Promise<NextResponse> {
  const bytes = await pdfDoRecibo(dados);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="recibo-${numeroDoRecibo(dados.paymentId).toLowerCase()}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
