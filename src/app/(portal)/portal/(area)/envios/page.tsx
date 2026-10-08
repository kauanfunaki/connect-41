import { notFound } from "next/navigation";
import { FileCheck } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { CartaoDeLista } from "@/components/portal/CartaoDeLista";
import { SelosDoEnvioNoPortal } from "@/components/documentosCliente/SeloDoEnvio";
import { clienteAtivoDoPortal } from "@/app/(portal)/usuario";
import { enviosDoCliente } from "@/lib/envios/consultas";
import { rotaDoEnvioNoPortal } from "@/lib/envios/regras";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Os documentos que o escritório mandou ao cliente (08/10/2026) — os envios
 * publicados das empresas do grupo dele, o mais novo primeiro. Até aqui só
 * chegavam pelo link do e-mail; o link segue valendo para quem não tem portal.
 */
export default async function PortalEnviosPage() {
  const cliente = await clienteAtivoDoPortal();
  if (!cliente || !cliente.modulos.has("portal_solicitacoes")) notFound();

  const lista = await enviosDoCliente({ tenantId: cliente.tenantId, companyIds: cliente.companyIds }, cliente.usuario.email);
  // O nome da empresa só ajuda a quem tem mais de uma no acesso.
  const variasEmpresas = cliente.companyIds.length > 1;

  return (
    <PageContainer>
      {/* Não é "só leitura": o cliente dá o aceite aqui. */}
      <PortalCabecalho
        titulo="Documentos do escritório"
        descricao="Documentos que o escritório mandou para você ler, baixar e, quando pedido, dar o aceite."
        somenteLeitura={false}
      />
      {lista.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileCheck />}
            title="Nenhum documento ainda"
            description="Quando o escritório mandar um documento para as suas empresas — guia, contrato, orientação —, ele aparece aqui."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lista.map((e) => (
            <li key={e.id}>
              <CartaoDeLista
                href={rotaDoEnvioNoPortal(e.id)}
                titulo={e.titulo}
                apoio={
                  <span>
                    {variasEmpresas ? `${e.empresaNome} · ` : ""}
                    {formatInstantDate(e.publicadoEm)}
                    {e.temAnexo ? " · com anexo" : ""}
                  </span>
                }
                selos={<SelosDoEnvioNoPortal envio={e} />}
                destaque={e.novo}
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
