import { notFound, redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { abrirArquivos } from "../../acesso";

/**
 * Endereço curto de uma pasta, para avisos e links de fora (09/10/2026): leva à
 * tela da empresa dona ou às pastas internas. Quem vê a pasta é decidido lá.
 */
export default async function AtalhoDaPastaPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await abrirArquivos();
  const { id } = await params;
  const pasta = await getPrisma().driveFolder.findFirst({ where: { id, tenantId: ctx.tenantId }, select: { companyId: true } });
  if (!pasta) notFound();
  redirect(pasta.companyId ? `/arquivos/empresa/${pasta.companyId}?pasta=${id}` : `/arquivos/internas?pasta=${id}`);
}
