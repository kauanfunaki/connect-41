import { notFound } from "next/navigation";
import { Calculator } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { TelaIndisponivel } from "@/components/portal/TelaIndisponivel";
import { CalculadoraDaReforma } from "@/components/tributario/calculadora/CalculadoraDaReforma";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";
import { hojeIso } from "@/lib/datas/calendario";
import { MODULO_DA_CALCULADORA } from "@/lib/tributario/calculadora/regras";
import { dadosIniciaisDaCalculadora } from "@/lib/tributario/calculadora/calculadoraServidor";
import { consultarCalculadoraDoPortal } from "./actions";

export const dynamic = "force-dynamic";

/**
 * A Calculadora da reforma no portal (19/11/2026, funcionalidade-794): o
 * mesmo cálculo oficial da tela da equipe, para o cliente simular CBS e IBS
 * de uma venda ou de um serviço. Aparece com o módulo ligado e some quando o
 * escritório bloqueia a tela (Telas liberadas). Sem o serviço no ar, diz que
 * não está disponível — o cliente não precisa saber de variável.
 */
export default async function PortalCalculadoraPage() {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !cliente.modulos.has(MODULO_DA_CALCULADORA)) notFound();
  if (await telaBloqueadaNoPortal(cliente.tenantId, "/portal/calculadora-tributaria")) return <TelaIndisponivel />;

  const hoje = hojeIso();
  const iniciais = await dadosIniciaisDaCalculadora(hoje);

  return (
    <PageContainer>
      <PortalCabecalho titulo="Simulador da reforma" descricao="Quanto de CBS e IBS incide numa venda ou num serviço, pelo cálculo oficial da Receita Federal." />
      {iniciais.ok ? (
        <CalculadoraDaReforma
          consultar={consultarCalculadoraDoPortal}
          hoje={hoje}
          ufs={iniciais.dados.ufs}
          classificacoesIniciais={iniciais.dados.classificacoes}
          referenciasIniciais={iniciais.dados.referencias}
          fonte={iniciais.dados.fonte}
          variante="portal"
        />
      ) : (
        <Card>
          <EmptyState
            icon={<Calculator />}
            title="O simulador está fora do ar agora"
            description="Tente de novo mais tarde. Se precisar da conta hoje, abra uma solicitação para a equipe do escritório."
          />
        </Card>
      )}
    </PageContainer>
  );
}
