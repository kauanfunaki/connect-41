import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getSectorMaps } from "@/lib/sectors";
import { formatInstantDateTime } from "@/lib/format";
import { formatarBytes } from "@/lib/fileSize";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { carregarComunicado } from "@/lib/comunicados/consultas";

export const dynamic = "force-dynamic";

/** O comunicado e a leitura cliente a cliente — quem ainda não leu vem primeiro. */
export default async function ComunicadoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) notFound();

  const { id } = await params;
  const [c, { labels }] = await Promise.all([carregarComunicado(ctx.tenantId, id), getSectorMaps(ctx.tenantId)]);
  if (!c || !canViewSector(ctx, c.setor)) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Comunicados", href: "/solicitacoes/comunicados" }, { label: c.titulo }]} />
      <PageHeader
        title={c.titulo}
        subtitle={
          <>
            {labels[c.setor] ?? c.setor} · {formatInstantDateTime(c.enviadoEm)}
            {c.enviadoPor ? ` · ${c.enviadoPor}` : ""}
          </>
        }
        action={
          <span className="text-fs-3 text-fg-secondary tabular-nums">
            Lido por {c.resumo.leram} de {c.resumo.clientes} {c.resumo.clientes === 1 ? "cliente" : "clientes"}
          </span>
        }
      />

      <Card className="mb-5 p-5">
        <p className="text-fs-4 text-fg whitespace-pre-wrap break-words leading-relaxed">{c.texto}</p>
        {c.anexos.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {c.anexos.map((a) => (
              <li key={a.id}>
                <a href={`/api/comunicados/anexos/${a.id}`} className="inline-flex items-center gap-1.5 text-fs-2 text-brand hover:underline break-all">
                  <Paperclip size={12} className="shrink-0" /> {a.fileName}
                  <span className="text-fg-muted">· {formatarBytes(a.sizeBytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-fs-2 text-fg-muted">
          {c.avisosEnviadosEm
            ? `E-mails e avisos no celular enviados em ${formatInstantDateTime(c.avisosEnviadosEm)}.`
            : "Os e-mails e avisos no celular ainda estão saindo."}
        </p>
      </Card>

      <h2 className="font-display text-section font-semibold text-fg mb-3">Quem leu</h2>
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
        {c.grupos.map((g) => (
          <div key={g.grupoId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span className="text-fs-3 font-medium text-fg">{g.nome}</span>
            {g.leitores.length === 0 ? (
              <Badge variant="warning">Ainda não leu</Badge>
            ) : (
              <span className="text-fs-2 text-fg-secondary">
                {g.leitores.map((l) => `${l.nome} em ${formatInstantDateTime(l.em)}`).join(" · ")}
              </span>
            )}
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
