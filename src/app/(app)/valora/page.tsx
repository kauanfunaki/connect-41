import { notFound } from "next/navigation";
import { Calculator, HandCoins, Settings } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { EditarProposta } from "@/components/valora/EditarProposta";
import { acessoAoValora } from "@/lib/valora/servidor";
import { brl } from "@/lib/valora/formato";
import { formatInstantDate } from "@/lib/format";
import { ROTULO_REGIME, type Perfil } from "@/lib/valora/motor";

export const dynamic = "force-dynamic";

const SITUACAO: Record<string, { rotulo: string; variante: "info" | "success" | "danger" }> = {
  ABERTA: { rotulo: "Em aberto", variante: "info" },
  GANHA: { rotulo: "Ganha", variante: "success" },
  PERDIDA: { rotulo: "Perdida", variante: "danger" },
};

const numero = (d: { toNumber(): number } | null) => (d === null ? null : d.toNumber());

/**
 * Propostas simuladas. O registro de ganhas e perdidas, com o motivo e o preço do
 * concorrente, é a fonte mais confiável de "quanto o mercado paga" — as tabelas
 * de sindicato são facultativas e ficam acima do praticado.
 */
export default async function ValoraPage() {
  const acesso = await acessoAoValora();
  if (!acesso) notFound();

  const propostas = await getPrisma().valoraProposta.findMany({
    where: { tenantId: acesso.tenantId },
    select: {
      id: true,
      cliente: true,
      perfil: true,
      precoAlvo: true,
      precoOferecido: true,
      precoConcorrente: true,
      status: true,
      motivo: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const linhas = propostas.map((p) => ({
    ...p,
    precoAlvo: numero(p.precoAlvo),
    precoOferecido: numero(p.precoOferecido),
    precoConcorrente: numero(p.precoConcorrente),
    regime: ROTULO_REGIME[(p.perfil as Perfil).regime] ?? "—",
  }));

  const ganhas = linhas.filter((p) => p.status === "GANHA").length;
  const perdidas = linhas.filter((p) => p.status === "PERDIDA").length;
  const decididas = ganhas + perdidas;
  // Oferecido ÷ alvo: abaixo de 100% é desconto dado; acima, gordura que o cliente aceitou.
  const comparaveis = linhas.filter((p) => p.precoAlvo && p.precoOferecido);
  const oferecidoSobreAlvo = comparaveis.length
    ? comparaveis.reduce((s, p) => s + p.precoOferecido! / p.precoAlvo!, 0) / comparaveis.length
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Valora"
        subtitle="Honorário pelo custo real de atender: simule com o cliente, proponha entre o piso e a tabela, e registre o retorno."
        action={
          <div className="flex gap-2">
            {acesso.podeGerir && (
              <Button href="/valora/parametros" variant="secondary" size="sm">
                <Settings size={13} /> Parâmetros
              </Button>
            )}
            {acesso.podeSimular && (
              <Button href="/valora/nova" size="sm">
                <Calculator size={13} /> Nova simulação
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Em aberto" value={linhas.filter((p) => p.status === "ABERTA").length} />
        <MetricCard label="Ganhas" value={ganhas} />
        <MetricCard label="Taxa de fechamento" value={decididas ? `${Math.round((ganhas / decididas) * 100)}%` : "—"} sub={`${decididas} decididas`} />
        <MetricCard
          label="Oferecido ÷ alvo"
          value={oferecidoSobreAlvo === null ? "—" : `${Math.round(oferecidoSobreAlvo * 100)}%`}
          sub="média das propostas com preço"
        />
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          title="Nenhuma proposta ainda"
          description="Toda simulação salva aparece aqui. Registrar se fechou ou perdeu, e por quanto, é o que mostra onde o preço está."
          icon={<HandCoins />}
        />
      ) : (
        <>
          <CartoesNoCelular>
            {linhas.map((p) => (
              <Cartao key={p.id}>
                <TopoDoCartao nome={p.cliente} valor={brl(p.precoAlvo)} />
                <InfoDoCartao>
                  {p.regime} · {formatInstantDate(p.createdAt)} · {p.createdBy.name}
                </InfoDoCartao>
                <InfoDoCartao className="tabular-nums">
                  oferecido {brl(p.precoOferecido)} · concorrente {brl(p.precoConcorrente)}
                </InfoDoCartao>
                {p.motivo && <InfoDoCartao>{p.motivo}</InfoDoCartao>}
                <PeDoCartao>
                  <Badge variant={SITUACAO[p.status]?.variante ?? "info"}>{SITUACAO[p.status]?.rotulo ?? p.status}</Badge>
                  {acesso.podeSimular && (
                    <span className="ml-auto">
                      <EditarProposta proposta={p} />
                    </span>
                  )}
                </PeDoCartao>
              </Cartao>
            ))}
          </CartoesNoCelular>

          <TabelaNoDesktop>
            <table className="w-full min-w-[920px] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                  <th className="py-2 pr-3 font-medium">Cliente</th>
                  <th className="py-2 pr-3 font-medium">Regime</th>
                  <th className="py-2 pr-3 font-medium text-right">Alvo</th>
                  <th className="py-2 pr-3 font-medium text-right">Oferecido</th>
                  <th className="py-2 pr-3 font-medium text-right">Concorrente</th>
                  <th className="py-2 pr-3 font-medium">Situação</th>
                  <th className="py-2 pr-3 font-medium">Criada</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => (
                  <tr key={p.id} className="border-b border-border-soft align-top hover:bg-surface-hover transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className="font-medium">{p.cliente}</span>
                      {p.motivo && <span className="block text-[11px] text-fg-muted">{p.motivo}</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-fg-secondary">{p.regime}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{brl(p.precoAlvo)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{brl(p.precoOferecido)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{brl(p.precoConcorrente)}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={SITUACAO[p.status]?.variante ?? "info"}>{SITUACAO[p.status]?.rotulo ?? p.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-fg-secondary">
                      {formatInstantDate(p.createdAt)}
                      <span className="block text-[11px] text-fg-muted">{p.createdBy.name}</span>
                    </td>
                    <td className="py-2.5">{acesso.podeSimular && <EditarProposta proposta={p} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabelaNoDesktop>
          <p className="text-[11px] text-fg-muted mt-3">
            O alvo é a foto do dia em que a proposta foi salva: mudar custos ou margem em Parâmetros não reescreve propostas
            antigas.
          </p>
        </>
      )}
    </PageContainer>
  );
}
