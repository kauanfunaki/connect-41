import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * A aba SPED sem o motor configurado. A classificação, a apuração e o
 * fechamento são feitos no Connect, mas sobre o arquivo e os documentos que o
 * motor guarda; e gerar é sempre no motor — não há geração local.
 */
export function SemMotor() {
  return <>
    <PageHeader title="SPED" />
    <Card>
      <EmptyState
        icon={<Settings2 />}
        title="Configure o motor SPED"
        description="Ligue a integração SPED Generator com a URL, o token de leitura e o token de escrita."
        action={<Button href="/admin/integracoes">Abrir Integrações</Button>}
      />
    </Card>
  </>;
}
