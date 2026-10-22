import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor, SemFonteNoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { EmpresasMotor } from "@/components/fiscal/motor/EmpresasMotor";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_configuracoes");
  const params = await searchParams;
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      const atual = aba === "depara" || aba === "regras" ? aba : "empresas";
      const gerir = await podeNoModulo(ctx, "fiscal_configuracoes", "gerir");
      return <CascoDoMotor tela={tela} caminho="/fiscal/configuracoes" abas={[{ chave: "empresas", rotulo: "Empresas" }]} aba={atual} titulo={atual === "depara" ? "De-Para CFOP" : atual === "regras" ? "Regras" : "Empresas no motor"} descricao="O cadastro de cada estabelecimento no motor SPED e o vínculo com as empresas do escritório.">
        {atual === "empresas" ? <EmpresasMotor tela={tela} permiteGerir={gerir} /> : <SemFonteNoMotor area={atual === "depara" ? "De-Para CFOP" : "Regras fiscais"} />}
      </CascoDoMotor>;
    }
  }
  if (aba === "empresas") redirect("/fiscal/configuracoes?aba=parametros");
  if (aba === "cfop") redirect("/fiscal/configuracoes?aba=regras");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="configuracoes" /></Suspense>;
}
