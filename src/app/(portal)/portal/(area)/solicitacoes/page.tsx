import { notFound } from "next/navigation";
import { Inbox, Plus } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { CartaoDeLista } from "@/components/portal/CartaoDeLista";
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

      {/* O recorte no "Filtros", como Pendências, Processos e Exigências
          (07/10/2026): era um SegmentedControl, que troca a visão da tela
          (lista/quadro) e não filtra — a regra da conferência de 30/09. */}
      <FiltrosDaTela
        className="mb-4"
        campos={[
          {
            chave: "recorte",
            rotulo: "Situação",
            vazioLabel: "Em aberto",
            opcoes: [
              { value: "aguardando", label: "Aguardando você" },
              { value: "encerradas", label: "Encerradas" },
            ],
          },
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
              <CartaoDeLista
                href={`/portal/solicitacoes/${s.id}`}
                sobretitulo={`Nº ${s.numero}`}
                titulo={s.assunto}
                apoio={
                  <span>
                    {s.empresaNome} ·{" "}
                    {s.respondidaEm
                      ? `respondida em ${formatInstantDate(s.respondidaEm)}`
                      : emAberto(s.status)
                        ? `resposta até ${formatInstantDate(s.prazo)}`
                        : `atualizada em ${formatInstantDate(s.atualizadaEm)}`}
                  </span>
                }
                selos={<SeloDaSolicitacao status={s.status} lado="CLIENTE" />}
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
