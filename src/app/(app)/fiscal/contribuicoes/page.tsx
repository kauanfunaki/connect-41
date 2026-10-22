import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor, SemFonteNoMotor } from "@/components/fiscal/motor/CascoDoMotor";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_contribuicoes");
  const params = await searchParams;
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (aba === "sped") redirect("/fiscal/entregas?obrigacao=contribuicoes");
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) return <CascoDoMotor tela={tela} caminho="/fiscal/contribuicoes" titulo="Apuração" descricao="Apuração do PIS e da COFINS no motor SPED." semEstabelecimento><SemFonteNoMotor area="Apuração do PIS e da COFINS" /></CascoDoMotor>;
  }
  if (aba === "parametros") redirect("/fiscal/configuracoes?aba=parametros");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="contribuicoes" /></Suspense>;
}
