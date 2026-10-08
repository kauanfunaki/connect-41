import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Simulador } from "@/components/valora/Simulador";
import { acessoAoValora, configDoValora } from "@/lib/valora/servidor";
import { Aviso } from "@/components/ui/Aviso";

export const dynamic = "force-dynamic";

export default async function NovaSimulacaoPage() {
  const acesso = await acessoAoValora();
  if (!acesso || !acesso.podeSimular) notFound();
  const { catalogo, parametros, configurado } = await configDoValora(acesso.tenantId);

  return (
    <PageContainer>
      {/* O voltar do app (o `BackButton` com destino), e não um botão no lugar
          das ações — um desenho só para "voltar" (07/10/2026). */}
      <BackButton href="/valora" rotulo="Propostas" className="mb-3" />
      <PageHeader
        title="Nova simulação"
        subtitle="Preencha com o cliente: cada resposta liga uma atividade dos setores, e o honorário sai do tempo que ela custa."
      />
      {!configurado && (
        <Aviso tom="atencao" className="mb-4">
          Os custos dos setores ainda não foram informados em Parâmetros — o preço abaixo cobre só o rateio padrão e não
          serve para proposta.
        </Aviso>
      )}
      <Simulador catalogo={catalogo} parametros={parametros} podeSalvar={acesso.podeSimular} />
    </PageContainer>
  );
}
