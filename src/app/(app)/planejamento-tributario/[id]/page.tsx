import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { AreaDaAvaliacao } from "@/components/tributario/AreaDaAvaliacao";
import { AcoesDaAvaliacao } from "@/components/tributario/AcoesDaAvaliacao";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { lerAparencia } from "@/lib/aparencia/leitura";
import { lerAvaliacao, versoesDaAvaliacao } from "@/lib/tributario/servidor";
import { ROTA_DO_PLANEJAMENTO } from "@/lib/tributario/regras";

export const dynamic = "force-dynamic";

/** Uma avaliação do Planejamento tributário: dados, premissas, resultado, relatório e histórico. */
export default async function AvaliacaoTributariaPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await abrirTelaDoModulo("contabil_planejamento");
  const { id } = await params;

  const [avaliacao, versoes, podeAgir, aparencia] = await Promise.all([
    lerAvaliacao(ctx.tenantId, id),
    versoesDaAvaliacao(ctx.tenantId, id),
    podeNoModulo(ctx, "contabil_planejamento", "agir"),
    lerAparencia(ctx.tenantId),
  ]);
  if (!avaliacao) notFound();

  // Na lixeira a avaliação não abre nem salva (regra do original): só restaurar.
  if (avaliacao.naLixeiraEm) {
    return (
      <PageContainer>
        <BackButton href={`${ROTA_DO_PLANEJAMENTO}?aba=lixeira`} rotulo="Lixeira" className="mb-3" />
        <EmptyState
          icon={<Trash2 />}
          title={`“${avaliacao.estudo.name}” está na lixeira`}
          description="Restaure a avaliação para abrir, editar ou imprimir. Dados e histórico foram preservados."
          action={
            podeAgir ? (
              <AcoesDaAvaliacao id={avaliacao.id} nome={avaliacao.estudo.name} revisao={avaliacao.revisao} naLixeira />
            ) : undefined
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <AreaDaAvaliacao
        // Abrir outra avaliação (ou a mesma depois de restaurar) recomeça o estado da tela.
        key={avaliacao.id}
        id={avaliacao.id}
        revisaoInicial={avaliacao.revisao}
        estudoInicial={avaliacao.estudo}
        empresa={avaliacao.empresa}
        versoes={versoes}
        marca={{ nome: aparencia.escritorio.nome, logoUrl: aparencia.escritorio.logoUrl }}
        podeAgir={podeAgir}
      />
    </PageContainer>
  );
}
