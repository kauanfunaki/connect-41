import { Suspense } from "react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { prepararTelaDoSped } from "@/lib/fiscal/sped/tela";
import { CascoDoSped } from "@/components/fiscal/sped/CascoDoSped";
import { SemMotor } from "@/components/fiscal/sped/SemMotor";
import { FechamentoDoSped } from "@/components/fiscal/sped/FechamentoDoSped";
import { CarregandoLeitura } from "@/components/fiscal/motor/LeituraDoMotor";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await abrirTelaDoModulo("fiscal_contribuicoes");
  const params = await searchParams;
  const tela = await prepararTelaDoSped(params, "fechamento");
  if (!tela) return <SemMotor />;
  return <CascoDoSped tela={tela}>
    <Suspense key={JSON.stringify(params)} fallback={<CarregandoLeitura oQue="o fechamento da competência" />}>
      <FechamentoDoSped tela={tela} params={params} />
    </Suspense>
  </CascoDoSped>;
}
