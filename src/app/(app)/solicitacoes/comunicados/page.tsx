import { notFound } from "next/navigation";
import { Megaphone, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors, getSectorMaps } from "@/lib/sectors";
import { formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { AbasDoAtendimento } from "@/components/solicitacoes/AbasDoAtendimento";
import { setoresDaFila } from "@/lib/solicitacoes/acesso";
import { listarComunicados } from "@/lib/comunicados/consultas";
import { podeComunicarPeloSetor } from "@/lib/comunicados/acesso";

export const dynamic = "force-dynamic";

/** Os comunicados da 41 aos clientes (01/10), com quantos clientes já leram cada um. */
export default async function ComunicadosPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) notFound();

  const [lista, ativos, { labels }] = await Promise.all([
    listarComunicados(ctx.tenantId, setoresDaFila(ctx)),
    getActiveSectors(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
  ]);
  const podeEnviar = ativos.some((s) => podeComunicarPeloSetor(ctx, s.code));

  return (
    <PageContainer>
      <PageHeader
        title="Comunicados"
        subtitle="Avisos do escritório para vários clientes de uma vez. Aparecem no portal, chegam por e-mail e mostram quem já leu."
        action={
          podeEnviar ? (
            <Button href="/solicitacoes/comunicados/novo">
              <Plus size={14} /> Novo comunicado
            </Button>
          ) : undefined
        }
      />

      <AbasDoAtendimento ativa="comunicados" />

      {lista.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="Nenhum comunicado ainda"
          description={podeEnviar ? "Recesso, mudança de prazo, orientação: avise os clientes pelo portal, sem lista de transmissão no WhatsApp." : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((c) => (
            <li key={c.id}>
              {/* Cartão-link no desenho único (07/10/2026): o `Card` com `href`,
                  o mesmo dos cartões do Kanban, Espaços e Transferências. */}
              <Card
                href={`/solicitacoes/comunicados/${c.id}`}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 p-4"
              >
                <span className="min-w-0 flex-1 basis-72">
                  <span className="block text-card-title font-semibold text-fg">{c.titulo}</span>
                  <span className="block mt-0.5 text-fs-2 text-fg-muted">
                    {labels[c.setor] ?? c.setor} · {formatInstantDateTime(c.enviadoEm)}
                    {c.enviadoPor ? ` · ${c.enviadoPor}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {!c.avisosEnviados && <Badge variant="info">Enviando e-mails…</Badge>}
                  <span className="text-ui text-fg-secondary tabular-nums">
                    Lido por {c.leram} de {c.clientes} {c.clientes === 1 ? "cliente" : "clientes"}
                  </span>
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
