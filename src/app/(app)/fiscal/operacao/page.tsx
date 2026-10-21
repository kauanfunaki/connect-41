import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await abrirTelaDoModulo("fiscal_operacao");
  const { aba } = await searchParams;
  // Fila e Erros viraram o filtro Estado do Histórico (15/10/2026).
  if (aba === "fila" || aba === "erros") redirect(`/fiscal/operacao?aba=historico&estado=${aba === "fila" ? "fila" : "erro"}`);
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="operacao" /></Suspense>;
}
