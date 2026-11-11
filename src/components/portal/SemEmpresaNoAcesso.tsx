import { MessageSquarePlus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { telaBloqueadaNoPortal } from "@/lib/portal/telasBloqueadas";

/**
 * O vazio das telas por empresa quando o acesso não tem empresa nenhuma
 * (11/11/2026, P37). Era só o título — "Nenhuma empresa vinculada", "Nenhuma
 * empresa no seu acesso" —, e o cliente ficava sem saber o que fazer. Agora
 * diz o caminho e, quando o escritório tem as Solicitações no portal, leva
 * direto ao pedido. Sem as Solicitações (ou com a tela bloqueada), fica a frase.
 */
export async function SemEmpresaNoAcesso({
  tenantId,
  modulos,
  icone,
}: {
  tenantId: string;
  modulos: ReadonlySet<string>;
  icone: React.ReactNode;
}) {
  const podePedir = modulos.has("portal_solicitacoes") && !(await telaBloqueadaNoPortal(tenantId, "/portal/solicitacoes"));
  return (
    <Card>
      <EmptyState
        icon={icone}
        title="Nenhuma empresa no seu acesso"
        description="Fale com o escritório para ligar sua empresa ao seu acesso."
        action={
          podePedir ? (
            <Button href="/portal/solicitacoes/nova">
              <MessageSquarePlus size={16} aria-hidden /> Nova solicitação
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}
