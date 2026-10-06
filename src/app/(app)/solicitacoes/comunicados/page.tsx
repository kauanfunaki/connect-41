import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors, getSectorMaps } from "@/lib/sectors";
import { formatInstantDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
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
              <Link
                href={`/solicitacoes/comunicados/${c.id}`}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-4 shadow-[var(--c41-shadow-xs)] hover:border-border-strong transition-colors"
              >
                <span className="min-w-0 flex-1 basis-72">
                  <span className="block text-[14px] font-semibold text-fg">{c.titulo}</span>
                  <span className="block mt-0.5 text-[12.5px] text-fg-muted">
                    {labels[c.setor] ?? c.setor} · {formatInstantDateTime(c.enviadoEm)}
                    {c.enviadoPor ? ` · ${c.enviadoPor}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {!c.avisosEnviados && <Badge variant="info">Enviando e-mails…</Badge>}
                  <span className="text-[13px] text-fg-secondary tabular-nums">
                    Lido por {c.leram} de {c.clientes} {c.clientes === 1 ? "cliente" : "clientes"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
