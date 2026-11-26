"use client";

// A impressão e a planilha dos relatórios do Contábil Core (Bloco D, Fase D2, 26/11/2026). O "Imprimir" do
// original (`window.print`), com o cabeçalho que só aparecia no papel (o relatório, a empresa e o período). O
// papel é desenhado num portal direto no <body>, como o relatório do Tributário: dentro da área de rolagem do
// Connect ele ficava deslocado pelo menu e cortado. A planilha (Excel) é nova no Connect: o original só imprimia.

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const ID_DA_IMPRESSAO = "relatorio-contabil-core-impressao";

// Na tela, a cópia de impressão não aparece. Na impressão, só ela aparece.
const ESTILO_DE_IMPRESSAO = `#${ID_DA_IMPRESSAO} { display: none; }
@media print {
  body > *:not(#${ID_DA_IMPRESSAO}) { display: none !important; }
  #${ID_DA_IMPRESSAO} { display: block; padding: 24px; }
}`;

const semAssinatura = () => () => {};

export function ImprimirRelatorio({
  titulo,
  empresa,
  periodo,
  planilha,
  children,
}: {
  titulo: string;
  empresa: string;
  periodo: string;
  /** A rota da planilha (`/api/contabil-core/relatorios/...&formato=xlsx`). */
  planilha: string;
  children: React.ReactNode;
}) {
  // O portal só existe no navegador (no servidor não há document.body).
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);
  const [baixando, setBaixando] = useState(false);
  const toast = useToast();

  async function baixar() {
    setBaixando(true);
    const resp = await fetch(planilha).catch(() => null);
    if (!resp?.ok) {
      const corpo = (await resp?.json().catch(() => null)) as { error?: string } | null;
      toast.error(corpo?.error ?? "Não deu para gerar a planilha.");
    } else {
      const nome = /filename="([^"]+)"/.exec(resp.headers.get("Content-Disposition") ?? "")?.[1] ?? "relatorio.xlsx";
      const url = URL.createObjectURL(await resp.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
    }
    setBaixando(false);
  }

  return (
    <div>
      <style>{ESTILO_DE_IMPRESSAO}</style>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={baixar} loading={baixando} loadingLabel="Gerando…" disabled={baixando}>
          <Download size={14} aria-hidden /> Excel
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => window.print()}>
          <Printer size={14} aria-hidden /> Imprimir
        </Button>
      </div>
      {children}
      {noNavegador &&
        createPortal(
          <div id={ID_DA_IMPRESSAO} className="bg-white text-black">
            <div className="mb-4 border-b pb-3">
              <h2 className="text-xl font-bold">{titulo}</h2>
              <p className="text-sm">{empresa}</p>
              <p className="text-xs">Período: {periodo}</p>
            </div>
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
