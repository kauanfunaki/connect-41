import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
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
      <PageHeader
        title="Nova simulação"
        subtitle="Preencha com o cliente: cada resposta liga uma atividade dos setores, e o honorário sai do tempo que ela custa."
        action={
          <Button href="/valora" variant="secondary" size="sm">
            <ArrowLeft size={14} /> Voltar às propostas
          </Button>
        }
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
