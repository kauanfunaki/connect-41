import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await abrirTelaDoModulo("fiscal_contribuicoes");
  const { aba } = await searchParams;
  if (aba === "parametros") redirect("/fiscal/configuracoes?aba=parametros");
  if (aba === "sped") redirect("/fiscal/entregas?obrigacao=contribuicoes");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="contribuicoes" /></Suspense>;
}
