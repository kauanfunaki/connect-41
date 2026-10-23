import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { ApuracaoIcmsMotor, DcipDimeMotor, DemonstrativoIcmsMotor } from "@/components/fiscal/motor/IcmsIpiMotor";
import { CarregandoLeitura } from "@/components/fiscal/motor/LeituraDoMotor";
import { DecisoesMotor } from "@/components/fiscal/motor/DecisoesMotor";
import { permissoesDeDecisao } from "@/lib/fiscal/motor/permissoes";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_icms_ipi");
  const params = await searchParams;
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      // Ajustes: `/decisoes/ajuste_apuracao` (§5). Apuração, Demonstrativo e
      // DCIP e DIME: as leituras de §11.2 — as duas primeiras pesadas, só com
      // a aba aberta. A aba padrão continua a leve (Ajustes). DCIP e DIME é
      // tela própria no menu (`menu-sped`), sem as abas internas.
      const aba = params.aba === "apuracao" || params.aba === "demonstrativo" || params.aba === "dcip-dime" ? params.aba : "ajustes";
      return <CascoDoMotor tela={tela} caminho="/fiscal/icms-ipi" abas={aba === "dcip-dime" ? undefined : [{ chave: "apuracao", rotulo: "Apuração" }, { chave: "demonstrativo", rotulo: "Demonstrativo" }, { chave: "ajustes", rotulo: "Ajustes" }]} aba={aba} titulo={aba === "dcip-dime" ? "DCIP e DIME" : "Apuração"} descricao="Apuração, demonstrativo e ajustes do ICMS (E111, DIME e DCIP) do motor SPED, por estabelecimento.">
        {aba === "apuracao" ? <ApuracaoIcmsMotor tela={tela} params={params} />
          : aba === "demonstrativo" ? <DemonstrativoIcmsMotor tela={tela} params={params} />
            : aba === "dcip-dime" ? <Suspense key={JSON.stringify(params)} fallback={<CarregandoLeitura oQue="a DCIP e a DIME" />}><DcipDimeMotor tela={tela} params={params} /></Suspense>
              : <DecisoesMotor tela={tela} caminho="/fiscal/icms-ipi" aba={aba} tipos={["ajuste_apuracao"]} params={params} permissoes={await permissoesDeDecisao(ctx, ["ajuste_apuracao"])} />}
      </CascoDoMotor>;
    }
  }
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="icms-ipi" /></Suspense>;
}
