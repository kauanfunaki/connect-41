import { PageHeader } from "@/components/ui/PageHeader";
import { UserPlus, UserMinus, Palmtree } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { formatarNumero } from "@/lib/format";
import { ADMISSAO_EM_ANDAMENTO, DESLIGAMENTO_EM_PROCESSO } from "@/lib/dp/contagens";
import { FERIAS_EM_ABERTO } from "@/lib/ferias/regras";

// Hub que une Admissão (bloco 1), Rescisão/Desligamento (bloco 2) e Férias
// (bloco 3) do levantamento de DP/RH — mesma decisão de agrupamento do
// usuário (2026-07-10). Cada seção continua na sua própria rota/tela
// dedicada; esta página só concentra o resumo e o ponto de entrada único.
export default async function ColaboradoresPage() {
  const { ctx } = await abrirTelaDoModulo("dp_colaboradores");
  const prisma = getPrisma();

  const [admissoes, desligamentos, ferias] = await Promise.all([
    // As mesmas regras da Home (lote 6, 28/10/2026): src/lib/dp/contagens.ts.
    prisma.person.count({ where: { tenantId: ctx.tenantId, ...ADMISSAO_EM_ANDAMENTO } }),
    prisma.termination.count({ where: { tenantId: ctx.tenantId, ...DESLIGAMENTO_EM_PROCESSO } }),
    prisma.vacation.count({ where: { tenantId: ctx.tenantId, status: { in: [...FERIAS_EM_ABERTO] } } }),
  ]);


  return (
    <PageContainer>
      <PageHeader
        title="Colaboradores"
        subtitle="Admissões, desligamentos e férias — ciclo de vida do colaborador em um só lugar."
      />

      {/* Os três atalhos eram cartões montados à mão (até 30/09); agora são
          os cartões de total do resto do app — o número grande, o ícone e o
          cartão que leva à tela.
          07/10/2026 (auditoria DRG-19): o de desligamentos dizia "Rescisões" e
          abria "Desligamentos em Andamento", com a ficha dizendo
          "Desligamento" — um termo só para a lista. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Admissões", valor: formatarNumero(admissoes, 0), icone: <UserPlus />, detalhe: "em andamento", href: "/admissoes" },
          { rotulo: "Desligamentos", valor: formatarNumero(desligamentos, 0), icone: <UserMinus />, detalhe: "em processo", href: "/desligamentos" },
          { rotulo: "Férias", valor: formatarNumero(ferias, 0), icone: <Palmtree />, detalhe: "em aberto", href: "/ferias" },
        ]}
      />
    </PageContainer>
  );
}
