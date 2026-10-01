import Link from "next/link";
import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { getSectorMaps } from "@/lib/sectors";
import { comunicadosDoCliente } from "@/lib/comunicados/consultas";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Os avisos que a 41 mandou para o cliente (01/10), o mais novo primeiro. */
export default async function PortalComunicadosPage() {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !cliente.modulos.has("portal_solicitacoes")) notFound();

  const [lista, { labels }] = await Promise.all([
    comunicadosDoCliente(cliente.tenantId, cliente.sessao.clientGroupId, cliente.usuario.id),
    getSectorMaps(cliente.tenantId),
  ]);

  return (
    <PageContainer>
      <PortalCabecalho titulo="Comunicados" descricao="Avisos da 41 para você: recesso, prazos, orientações." />
      {lista.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone />} title="Nenhum comunicado ainda" description="Quando a 41 avisar algo, o comunicado aparece aqui e você recebe um e-mail." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((c) => (
            <li key={c.id}>
              <Link
                href={`/portal/comunicados/${c.id}`}
                className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-lg border p-4 shadow-[var(--c41-shadow-xs)] transition-colors ${
                  c.lido ? "border-border bg-surface hover:border-border-strong" : "border-brand/40 bg-brand-subtle hover:border-brand"
                }`}
              >
                <span className="min-w-0 flex-1 basis-64">
                  <span className={`block text-[14px] text-fg ${c.lido ? "font-medium" : "font-semibold"}`}>{c.titulo}</span>
                  <span className="block mt-0.5 text-[12.5px] text-fg-muted">
                    {labels[c.setor] ?? c.setor} · {formatInstantDate(c.enviadoEm)}
                  </span>
                </span>
                {!c.lido && <Badge variant="info">Novo</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
