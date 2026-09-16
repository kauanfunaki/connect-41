"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { ACCEPT_DOS_ANEXOS, MAXIMO_DE_ANEXOS } from "@/lib/financeiro/pendencias/anexo";

/**
 * Vários anexos com o mesmo `name`, um campo por arquivo.
 *
 * O `FileDropzoneField` é de um arquivo só; em vez de um componente novo de
 * seleção múltipla, cada arquivo ganha a sua faixa compacta e o formulário
 * submete todas com `name="anexos"` — a action lê com `getAll`. A conferência de
 * verdade (assinatura, tamanho) é no servidor; o `accept` aqui só poupa a viagem.
 */
export function CampoDeAnexos({ idBase }: { idBase: string }) {
  const [quantidade, setQuantidade] = useState(1);
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: quantidade }, (_, i) => (
        <FileDropzoneField key={i} id={`${idBase}-${i}`} name="anexos" accept={ACCEPT_DOS_ANEXOS} maxSizeMb={10} compacto />
      ))}
      {quantidade < MAXIMO_DE_ANEXOS && (
        <Button type="button" variant="linkMuted" className="text-[12px] self-start" onClick={() => setQuantidade((q) => q + 1)}>
          <Plus size={12} /> Outro anexo
        </Button>
      )}
    </div>
  );
}
