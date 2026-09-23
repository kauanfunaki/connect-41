import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Simulador } from "@/components/valora/Simulador";
import { acessoAoValora, configDoValora } from "@/lib/valora/servidor";

export const dynamic = "force-dynamic";

export default async function NovaSimulacaoPage() {
  const acesso = await acessoAoValora();
  if (!acesso || !acesso.podeSimular) notFound();
  const { catalogo, parametros, configurado } = await configDoValora(acesso.tenantId);

  return (
    <PageContainer>
      <PageHeader
        title="Nova simulação"
        subtitle="Preencha com o cliente: cada resposta liga uma atividade dos setores, e o honorário sai do tempo que ela custa."
        action={
          <Button href="/valora" variant="secondary" size="sm">
            Voltar às propostas
          </Button>
        }
      />
      {!configurado && (
        <p className="mb-4 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-[12px] text-warning">
          Os custos dos setores ainda não foram informados em Parâmetros — o preço abaixo cobre só o rateio padrão e não
          serve para proposta.
        </p>
      )}
      <Simulador catalogo={catalogo} parametros={parametros} podeSalvar={acesso.podeSimular} />
    </PageContainer>
  );
}
