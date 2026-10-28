import { notFound, redirect } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

// Os setores que podem abrir chamado foram para a configuração dos chamados,
// numa tela só, desde 28/10/2026 (lote 6). Este endereço fica para os links
// antigos.
export default async function AcessosHelpdeskPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();
  redirect("/chamados/configuracoes#setores");
}
