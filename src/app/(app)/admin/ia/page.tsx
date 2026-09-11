import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { AgenteCard } from "@/components/admin/AgenteCard";
import { ChamadasDeIA } from "@/components/admin/ChamadasDeIA";
import { listarAgentes, ultimasChamadas } from "@/lib/ia/data";
import { PRECOS_ESCRITOS_EM } from "@/lib/ia/custo";
import { moeda } from "@/lib/ia/tela";
import { formatInstantDate } from "@/lib/format";

// Teto de gasto e chave de IA são configuração do tenant inteiro, não de setor
// — mesmo critério da tela de Integrações.
export default async function AgentesDeIAPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  const agora = new Date();
  const prisma = getPrisma();
  const config = await prisma.tenantAiConfig.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { provider: true, model: true },
  });

  // Sem config de tenant o app ainda pode ter chave no ambiente, mas ela não é
  // do cliente — e esta tela fala da conta do cliente. Tratar como "sem chave"
  // aqui é o que faz o aviso abaixo aparecer para quem precisa cadastrar a sua.
  const [linhas, chamadas] = await Promise.all([
    listarAgentes(ctx.tenantId, config?.provider ?? null, config?.model ?? null, agora),
    ultimasChamadas(ctx.tenantId, 30),
  ]);

  const totalCentavos = linhas.reduce((n, l) => n + l.gasto.centavos, 0);
  const totalChamadas = linhas.reduce((n, l) => n + l.gasto.chamadas, 0);
  const totalSemCusto = linhas.reduce((n, l) => n + l.gasto.semCusto, 0);

  return (
    <PageContainer variant="narrow">
      <PageHeader
        title="Agentes de IA"
        subtitle="O que a IA fez neste mês, quanto custou e até onde pode ir. Só administradores veem esta tela."
      />

      {!config && (
        <Card className="p-4 mb-5 border-warning/40 bg-warning-bg">
          <p className="text-[13px] text-fg">
            Nenhuma chave de IA cadastrada para esta empresa — nenhum agente roda sem ela.{" "}
            <Link href="/admin/integracoes" className="text-brand hover:underline">
              Cadastrar em Integrações
            </Link>
            .
          </p>
        </Card>
      )}

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-fg-muted">Gasto no mês</p>
            <p className="text-[22px] font-semibold tabular-nums text-fg">{moeda(totalCentavos)}</p>
          </div>
          <p className="text-[13px] text-fg-secondary tabular-nums">
            {totalChamadas} {totalChamadas === 1 ? "chamada" : "chamadas"}
            {totalSemCusto > 0 && (
              // O total só significa alguma coisa quando esta parte é zero, e
              // por isso ela fica ao lado do número, não num rodapé.
              <span className="text-warning"> · {totalSemCusto} sem custo apurado</span>
            )}
          </p>
        </div>
        <p className="text-[12px] text-fg-muted mt-2">
          O mês começa à meia-noite de São Paulo. Os valores usam a tabela de preço escrita em{" "}
          {formatInstantDate(new Date(PRECOS_ESCRITOS_EM))} — enquanto ela não for conferida contra a
          página de preços do provedor, quem protege de verdade é o teto de chamadas.
        </p>
      </Card>

      <div className="flex flex-col gap-3 mb-6">
        {linhas.map((linha) => (
          <AgenteCard key={linha.def.code} linha={linha} podeEditar />
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Últimas chamadas</h2>
          <p className="text-[13px] text-fg-secondary">
            Quem pediu, sobre o quê e como terminou. É a resposta para “por que esse texto apareceu
            nesta ficha”.
          </p>
        </div>
        <Card className="p-4">
          <ChamadasDeIA chamadas={chamadas} agora={agora} />
        </Card>
      </section>
    </PageContainer>
  );
}
