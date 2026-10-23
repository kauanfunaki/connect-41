import { Suspense } from "react";
import { redirect } from "next/navigation";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { FiscalPagina } from "@/components/fiscal/previa/FiscalPagina";
import { modoDoFiscal } from "@/lib/fiscal/motor/servidor";
import { prepararTelaDoMotor } from "@/lib/fiscal/motor/tela";
import { CascoDoMotor } from "@/components/fiscal/motor/CascoDoMotor";
import { DemonstrativoContribMotor, FechamentoMotor } from "@/components/fiscal/motor/ContribuicoesMotor";
import { CarregandoLeitura } from "@/components/fiscal/motor/LeituraDoMotor";
import { DecisoesMotor } from "@/components/fiscal/motor/DecisoesMotor";
import { permissoesDeDecisao } from "@/lib/fiscal/motor/permissoes";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo("fiscal_contribuicoes");
  const params = await searchParams;
  const aba = typeof params.aba === "string" ? params.aba : undefined;
  if (aba === "sped") redirect("/fiscal/entregas?obrigacao=contribuicoes");
  if (await modoDoFiscal(ctx) === "motor") {
    const tela = await prepararTelaDoMotor(params);
    if (tela) {
      const atual = aba === "decisoes" || aba === "parametros" || aba === "fechamento" || aba === "demonstrativo" ? aba : "ajustes";
      const tipo = atual === "decisoes" ? "decisao_registro_contribuicoes" : atual === "parametros" ? "parametro_contribuicoes" : "ajuste_contribuicoes";
      // Fechamento (leve) e Demonstrativo (pesado) leem §11.3; o
      // demonstrativo só roda com a aba aberta.
      return <CascoDoMotor tela={tela} caminho="/fiscal/contribuicoes" abas={[{ chave: "ajustes", rotulo: "Ajustes" }, { chave: "decisoes", rotulo: "Decisões por registro" }, { chave: "parametros", rotulo: "Parâmetros" }, { chave: "fechamento", rotulo: "Fechamento" }, { chave: "demonstrativo", rotulo: "Demonstrativo" }]} aba={atual} titulo="Apuração" descricao="EFD Contribuições: ajustes do bloco M, decisões por registro, parâmetros, fechamento e demonstrativo, por raiz." semEstabelecimento>
        {atual === "fechamento" ? <Suspense key={JSON.stringify(params)} fallback={<CarregandoLeitura oQue="o fechamento" />}><FechamentoMotor tela={tela} params={params} /></Suspense>
          : atual === "demonstrativo" ? <Suspense key={JSON.stringify(params)} fallback={<CarregandoLeitura oQue="as competências do demonstrativo" />}><DemonstrativoContribMotor tela={tela} params={params} /></Suspense>
          : <DecisoesMotor tela={tela} caminho="/fiscal/contribuicoes" aba={atual} tipos={[tipo]} params={params} permissoes={await permissoesDeDecisao(ctx, [tipo])} />}
      </CascoDoMotor>;
    }
  }
  if (aba === "parametros") redirect("/fiscal/configuracoes?aba=parametros");
  return <Suspense fallback={<p className="text-ui text-fg-secondary">Carregando prévia fiscal…</p>}><FiscalPagina pagina="contribuicoes" /></Suspense>;
}
