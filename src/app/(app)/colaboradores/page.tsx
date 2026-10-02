import { PageHeader } from "@/components/ui/PageHeader";
import { UserPlus, UserMinus, Palmtree } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";

// Hub que une Admissão (bloco 1), Rescisão/Desligamento (bloco 2) e Férias
// (bloco 3) do levantamento de DP/RH — mesma decisão de agrupamento do
// usuário (2026-07-10). Cada seção continua na sua própria rota/tela
// dedicada; esta página só concentra o resumo e o ponto de entrada único.
export default async function ColaboradoresPage() {
  const { ctx } = await abrirTelaDoModulo("dp_colaboradores");
  const prisma = getPrisma();

  const [admissoes, desligamentos, ferias] = await Promise.all([
    prisma.person.count({
      where: { tenantId: ctx.tenantId, type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO" },
    }),
    prisma.termination.count({
      where: { tenantId: ctx.tenantId, status: { notIn: ["FINALIZADO", "CANCELADO"] } },
    }),
    prisma.vacation.count({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] },
      },
    }),
  ]);


  return (
    <PageContainer>
      <PageHeader
        title="Colaboradores"
        subtitle="Admissões, rescisões e férias — ciclo de vida do colaborador em um só lugar."
      />

      {/* Os três atalhos eram cartões montados à mão (até 30/09); agora são
          os cartões de total do resto do app — o número grande, o ícone e o
          cartão que leva à tela. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Admissões", valor: String(admissoes), icone: <UserPlus />, detalhe: "em andamento", href: "/admissoes" },
          { rotulo: "Rescisões", valor: String(desligamentos), icone: <UserMinus />, detalhe: "em processo", href: "/desligamentos" },
          { rotulo: "Férias", valor: String(ferias), icone: <Palmtree />, detalhe: "em aberto", href: "/ferias" },
        ]}
      />
    </PageContainer>
  );
}
