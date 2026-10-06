import Link from "next/link";
import { notFound } from "next/navigation";
import { Inbox, Plus } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { SeloDaSolicitacao } from "@/components/solicitacoes/SelosDaSolicitacao";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { listarDoCliente } from "@/lib/solicitacoes/consultas";
import { emAberto } from "@/lib/solicitacoes/regras";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * As solicitações do cliente (01/10) — o caminho dele para pedir qualquer
 * coisa à 41, no lugar do WhatsApp. A primeira tela do "Com a equipe".
 */
export default async function PortalSolicitacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ recorte?: string }>;
}) {
  const { escopo, modulos } = await contextoFinanceiroDoPortal();
  if (!modulos.has("portal_solicitacoes")) notFound();

  const { recorte: pedido } = await searchParams;
  // "Aguardando você" (05/10) é onde o Início leva quando a equipe espera o cliente.
  const recorte = pedido === "encerradas" || pedido === "aguardando" ? pedido : "abertas";
  const linhas = await listarDoCliente({ tenantId: escopo.tenantId, companyIds: escopo.companyIds ?? [] }, recorte);

  return (
    <PageContainer>
      <PageHeader
        title="Solicitações"
        subtitle="Peça documentos, alterações ou o que precisar do escritório. Cada pedido tem número, prazo de resposta e a conversa com a equipe."
        action={
          <Button href="/portal/solicitacoes/nova">
            <Plus size={14} /> Nova solicitação
          </Button>
        }
      />

      <SegmentedControl
        label="Quais solicitações"
        active={recorte}
        className="mb-4"
        items={[
          { key: "abertas", label: "Em aberto", href: "/portal/solicitacoes" },
          { key: "aguardando", label: "Aguardando você", href: "/portal/solicitacoes?recorte=aguardando" },
          { key: "encerradas", label: "Encerradas", href: "/portal/solicitacoes?recorte=encerradas" },
        ]}
      />

      {linhas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Inbox />}
            title={
              recorte === "abertas"
                ? "Nenhuma solicitação em aberto"
                : recorte === "aguardando"
                  ? "Nenhuma solicitação esperando você"
                  : "Nenhuma solicitação encerrada"
            }
            description={recorte === "abertas" ? "Precisa de algo do escritório? Abra uma solicitação: a equipe certa recebe na hora." : undefined}
            action={
              recorte === "abertas" ? (
                <Button href="/portal/solicitacoes/nova" variant="secondary">
                  <Plus size={14} /> Nova solicitação
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {linhas.map((s) => (
            <li key={s.id}>
              <Link
                href={`/portal/solicitacoes/${s.id}`}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-4 shadow-[var(--c41-shadow-xs)] hover:border-border-strong transition-colors"
              >
                <span className="min-w-0 flex-1 basis-64">
                  <span className="block text-[11.5px] font-semibold uppercase tracking-wider text-fg-muted tabular-nums">Nº {s.numero}</span>
                  <span className="block mt-0.5 text-[14px] font-semibold text-fg">{s.assunto}</span>
                  <span className="block mt-0.5 text-[12.5px] text-fg-muted">
                    {s.empresaNome} ·{" "}
                    {s.respondidaEm
                      ? `respondida em ${formatInstantDate(s.respondidaEm)}`
                      : emAberto(s.status)
                        ? `resposta até ${formatInstantDate(s.prazo)}`
                        : `atualizada em ${formatInstantDate(s.atualizadaEm)}`}
                  </span>
                </span>
                <SeloDaSolicitacao status={s.status} lado="CLIENTE" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
