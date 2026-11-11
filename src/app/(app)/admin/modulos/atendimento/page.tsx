import { notFound, redirect } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

// As configurações do Atendimento moram no próprio módulo (10/11/2026); este
// endereço é o do catálogo de Configurações, e só leva até lá.
export default async function ConfiguracoesDoAtendimentoNoAdmin() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();
  redirect("/atendimento/configuracoes");
}
