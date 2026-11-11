import { NextResponse } from "next/server";
import type { PortalAccessTokenPayload } from "@/lib/auth/types";
import { getPrisma } from "@/lib/prisma";
import { whereDoAlcance } from "@/lib/fiscal/alcance";
import { identificadorDoMotor } from "@/lib/fiscal/sped/local/acervo";
import { nomeDoPdfNoPortal, raizesDoDocumento, temPdfNoPortal } from "@/lib/fiscal/documentoNoPortal";
import { obterPdf, ErroDoSped } from "@/lib/sped/client";
import { credenciaisDoSped } from "@/lib/sped/credenciais";
import { raizesDoAlcance } from "@/lib/sped/raizes";
import { alcanceDoCliente } from "@/app/(portal)/alcance";

const SEM_ARQUIVO = "O arquivo desta nota não está guardado. Se precisar dele, peça à equipe.";

const erro = (mensagem: string, status: number) => NextResponse.json({ error: mensagem }, { status });

/**
 * O PDF de um documento fiscal, baixado pelo cliente no portal (11/11/2026).
 * A rota (`/portal/documentos/[id]/pdf`) já conferiu a sessão e a tela
 * bloqueada; aqui, o resto do escopo, antes de qualquer pedido ao motor.
 *
 * ─── A fronteira ────────────────────────────────────────────────────────────
 *
 * 1. O documento é lido **pelo alcance do cliente** (`whereDoAlcance`, as
 *    empresas ligadas ao acesso dele), no `where` — id de outra empresa, de
 *    outro escritório ou inexistente responde 404 igual, e nada do documento
 *    chega à memória. Removido na origem também some, como na lista.
 * 2. A raiz de CNPJ que vai ao motor não vem da URL: sai do próprio documento
 *    e só vale se estiver entre as raízes que o alcance autoriza
 *    (`raizesDoAlcance`, a mesma régua da consulta de CT-e da equipe).
 *
 * O PDF mora no motor do SPED, atrás do token de serviço — o Connect busca e
 * repassa os bytes, como na rota de CT-e da equipe. `attachment`: no celular o
 * cliente quer o arquivo para guardar ou mandar, não uma aba nova.
 */
export async function pdfDoDocumentoNoPortal(sessao: PortalAccessTokenPayload, id: string): Promise<NextResponse> {
  const naoEncontrado = () => erro("Documento não encontrado.", 404);

  const alcance = await alcanceDoCliente(sessao);
  if (alcance.tipo !== "EMPRESAS" || alcance.companyIds.length === 0) return naoEncontrado();

  const doc = await getPrisma().fiscalDocument.findFirst({
    where: { AND: [whereDoAlcance(alcance)], id, removedAtOrigin: false },
    select: {
      id: true,
      type: true,
      number: true,
      series: true,
      origin: true,
      renderizavel: true,
      spedTipo: true,
      spedIdentificador: true,
      issuerDocument: true,
      recipientDocument: true,
      company: { select: { cnpj: true } },
    },
  });
  if (!doc) return naoEncontrado();

  const motor = temPdfNoPortal(doc) ? identificadorDoMotor(doc) : null;
  if (!motor) return erro(SEM_ARQUIVO, 409);

  const permitidas = await raizesDoAlcance(alcance);
  const raizes = raizesDoDocumento({
    empresaCnpj: doc.company.cnpj,
    issuerDocument: doc.issuerDocument,
    recipientDocument: doc.recipientDocument,
  }).filter((r) => permitidas.has(r));
  if (raizes.length === 0) return erro(SEM_ARQUIVO, 409);

  const creds = await credenciaisDoSped(sessao.tenantId);
  if (!creds) return erro("O arquivo desta nota não está disponível agora. Tente mais tarde.", 503);

  for (const raiz of raizes) {
    try {
      const bytes = await obterPdf(creds, raiz, motor.tipo, motor.identificador);
      return new NextResponse(bytes, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${nomeDoPdfNoPortal(doc)}"`,
          "Cache-Control": "private, no-store",
        },
      });
    } catch (err) {
      // `semXml` antes do 404: o 409 do motor é a nota catalogada sem XML.
      if (err instanceof ErroDoSped && err.semXml) return erro(SEM_ARQUIVO, 409);
      // 404 do motor é "não nesta raiz": tenta a próxima.
      if (err instanceof ErroDoSped && err.status === 404) continue;
      console.error("[portal/documentos/pdf]", err);
      return erro("Não deu para buscar o arquivo agora. Tente de novo em alguns minutos.", 502);
    }
  }
  return naoEncontrado();
}
