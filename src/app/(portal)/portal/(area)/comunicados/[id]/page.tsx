import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
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
      {/* O "voltar" com destino fixo, no BackButton (07/10/2026): quem chega pelo
          link do e-mail não tem histórico para onde voltar, e o link escrito
          à mão tinha 20px de alvo. */}
      <BackButton href="/portal/comunicados" rotulo="Comunicados" className="mb-3" />
      <PageHeader title={c.titulo} subtitle={<>{labels[c.setor] ?? c.setor} · {formatInstantDateTime(c.enviadoEm)}</>} />
      <Card className="p-5">
        <p className="text-fs-4 text-fg whitespace-pre-wrap break-words leading-relaxed">{c.texto}</p>
        {c.anexos.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1">
            {c.anexos.map((a) => (
              <li key={a.id}>
                <a href={`/portal/comunicados/anexos/${a.id}`} className="inline-flex items-center gap-1.5 text-fs-2 text-brand hover:underline break-all">
                  <Paperclip size={12} className="shrink-0" /> {a.fileName}
                  <span className="text-fg-muted">· {formatarBytes(a.sizeBytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {/* Revisão de 05/10: botão não é link — "solicitação" era texto azul no meio da frase.
          "Nova solicitação" (07/10/2026), o nome do mesmo botão nas Solicitações e na Ajuda. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <p className="text-fs-2 text-fg-muted">Dúvida sobre este comunicado?</p>
        <Button href="/portal/solicitacoes/nova" variant="secondary" size="sm">
          Nova solicitação
        </Button>
      </div>
    </PageContainer>
  );
}
