"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

/**
 * O link dos eventos do mês para mandar ao cliente (12/11/2026): o endereço à
 * vista, selecionável, e o botão de copiar. Sem a URL pública configurada,
 * usa o endereço em que a pessoa está.
 */
export function LinkDoCliente({ token, urlPublica }: { token: string; urlPublica: string }) {
  const toast = useToast();
  const base = urlPublica || (typeof window !== "undefined" ? window.location.origin : "");
  const link = `${base}/eventos-do-mes/${token}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado. Mande ao cliente pelo WhatsApp ou e-mail.");
    } catch {
      toast.error("Não deu para copiar: selecione o link e copie.");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input readOnly value={link} aria-label="Link para o cliente" className="w-[28rem] max-w-full" compact onFocus={(e) => e.currentTarget.select()} />
      <Button type="button" variant="secondary" size="sm" onClick={copiar}>
        <Copy size={13} aria-hidden /> Copiar link
      </Button>
    </div>
  );
}
