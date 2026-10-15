import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";

/** As antigas abas que recortavam o acervo viraram o filtro Grupo (15/10/2026). */
const GRUPOS_ANTIGOS = ["nfse", "apoio", "quarentena"];

export default async function Page({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await abrirTelaDoModulo("fiscal_acervo");
  const { aba } = await searchParams;
  if (aba && GRUPOS_ANTIGOS.includes(aba)) redirect(`/fiscal/documentos?aba=acervo&grupo=${aba}`);
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="documentos" /></Suspense>;
}
