import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { getSectorMaps } from "@/lib/sectors";
import { abrirComunicadoDoCliente } from "@/lib/comunicados/consultas";
import { formatInstantDateTime } from "@/lib/format";
import { formatarBytes } from "@/lib/fileSize";

export const dynamic = "force-dynamic";

/**
 * Um comunicado aberto pelo cliente. Abrir é o que conta como leitura — a
 * mesma régua do documento enviado ao cliente, que registra a visita à página.
 */
export default async function PortalComunicadoPage({ params }: { params: Promise<{ id: string }> }) {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !cliente.modulos.has("portal_solicitacoes")) notFound();

  const { id } = await params;
  const [c, { labels }] = await Promise.all([
    abrirComunicadoDoCliente(cliente.tenantId, cliente.sessao.clientGroupId, cliente.usuario.id, id),
    getSectorMaps(cliente.tenantId),
  ]);
  if (!c) notFound();

  return (
    <PageContainer>
      <Link href="/portal/comunicados" className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg mb-3">
        <ArrowLeft size={14} /> Comunicados
      </Link>
      <PageHeader title={c.titulo} subtitle={<>{labels[c.setor] ?? c.setor} · {formatInstantDateTime(c.enviadoEm)}</>} />
      <Card className="p-5">
        <p className="text-[14px] text-fg whitespace-pre-wrap break-words leading-relaxed">{c.texto}</p>
        {c.anexos.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {c.anexos.map((a) => (
              <li key={a.id}>
                <a href={`/portal/comunicados/anexos/${a.id}`} className="inline-flex items-center gap-1.5 text-[12.5px] text-brand hover:underline break-all">
                  <Paperclip size={12} className="shrink-0" /> {a.fileName}
                  <span className="text-fg-muted">· {formatarBytes(a.sizeBytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-[12.5px] text-fg-muted">
        Dúvida sobre este comunicado? Abra uma{" "}
        <Link href="/portal/solicitacoes/nova" className="text-brand hover:underline">
          solicitação
        </Link>
        .
      </p>
    </PageContainer>
  );
}
