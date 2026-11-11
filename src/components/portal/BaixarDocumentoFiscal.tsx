"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { rotaDoPdfNoPortal } from "@/lib/fiscal/documentoNoPortal";

/**
 * "Baixar" de uma nota no portal (11/11/2026). Pelo `fetch`, e não por um
 * `<a download>`: o PDF vem do motor do SPED e pode levar alguns segundos — o
 * botão diz "Baixando…" e fica desabilitado nesse meio-tempo — e, quando o
 * arquivo não vem (motor sem o XML, fora do ar), o cliente lê o motivo num
 * aviso em vez de cair numa página com JSON cru.
 *
 * `rotulo` é o nome acessível completo ("Baixar o PDF da nota 123"): na lista,
 * vinte botões "Baixar" iguais não dizem ao leitor de tela qual é qual.
 */
export function BaixarDocumentoFiscal({ id, rotulo, className = "" }: { id: string; rotulo: string; className?: string }) {
  const [baixando, setBaixando] = useState(false);
  const toast = useToast();

  async function baixar() {
    setBaixando(true);
    try {
      const resp = await fetch(rotaDoPdfNoPortal(id)).catch(() => null);
      if (!resp?.ok) {
        const corpo = (await resp?.json().catch(() => null)) as { error?: string } | null;
        toast.error(corpo?.error ?? "Não deu para baixar o arquivo. Confira a internet e tente de novo.");
        return;
      }
      const nome = /filename="([^"]+)"/.exec(resp.headers.get("Content-Disposition") ?? "")?.[1] ?? "nota.pdf";
      const url = URL.createObjectURL(await resp.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      // O clique já entregou o arquivo ao navegador; soltar o endereço logo depois.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={baixar}
      loading={baixando}
      loadingLabel="Baixando…"
      aria-label={baixando ? undefined : rotulo}
      className={className}
    >
      <Download size={14} aria-hidden className="shrink-0" />
      Baixar
    </Button>
  );
}
