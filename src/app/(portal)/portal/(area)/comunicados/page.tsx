import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { CartaoDeLista } from "@/components/portal/CartaoDeLista";
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
      <PortalCabecalho titulo="Comunicados" descricao="Avisos do escritório para você: recesso, prazos, orientações." />
      {lista.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone />} title="Nenhum comunicado ainda" description="Quando o escritório avisar algo, o comunicado aparece aqui e você recebe um e-mail." />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((c) => (
            <li key={c.id}>
              <CartaoDeLista
                href={`/portal/comunicados/${c.id}`}
                titulo={c.titulo}
                apoio={
                  <span>
                    {labels[c.setor] ?? c.setor} · {formatInstantDate(c.enviadoEm)}
                  </span>
                }
                selos={!c.lido ? <Selo tom="marca">Novo</Selo> : undefined}
                destaque={!c.lido}
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
