"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { avisarEquipeDosEnvios } from "@/app/(portal)/portal/(area)/arquivos/actions";
import { EnvioDeArquivos } from "./EnvioDeArquivos";

/**
 * O botão e a área de envio do cliente no portal (09/10/2026). Tudo vai para
 * "Enviados pelo cliente" da empresa escolhida; quando a fila termina, a equipe
 * é avisada uma vez só, com a contagem conferida no servidor.
 */
export function EnviarArquivosDoCliente({ companyId, empresaNome }: { companyId: string; empresaNome: string }) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Button type="button" size="sm" onClick={() => setAberto(true)}>
        <Upload size={14} /> Enviar arquivos
      </Button>
    );
  }

  return (
    <div className="w-full bg-surface border border-border rounded-lg p-4">
      <EnvioDeArquivos
        url="/portal/arquivos/enviar"
        campos={{ companyId }}
        dica={`Os arquivos vão para a pasta Enviados pelo cliente de ${empresaNome}, e a equipe é avisada.`}
        onCancelar={() => setAberto(false)}
        onTerminou={async (ids) => {
          if (ids.length > 0) {
            await avisarEquipeDosEnvios(companyId, ids);
            toast.success(ids.length === 1 ? "Arquivo enviado. A equipe foi avisada." : `${ids.length} arquivos enviados. A equipe foi avisada.`);
          }
          router.refresh();
        }}
      />
    </div>
  );
}
