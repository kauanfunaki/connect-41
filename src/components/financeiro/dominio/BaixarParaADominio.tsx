"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";

type Props = {
  href: string;
  formato: "xlsx" | "txt";
  rotulo: string;
  variant?: "primary" | "secondary";
  /** Pergunta antes de baixar — o "Mês inteiro de novo", que duplica na Domínio. */
  confirmar?: { titulo: string; descricao: string; botao: string };
};

/**
 * Baixa a planilha da Domínio e atualiza a tela depois (auditoria de UX,
 * 30/10/2026). Era um `<a download>`: o servidor registrava a exportação ao
 * servir o arquivo, mas a página não sabia — os botões do primeiro download
 * continuavam e o cartão "Última planilha" só aparecia ao recarregar. Agora o
 * arquivo vem por `fetch`, o botão mostra que está gerando, e a tela recarrega
 * os dados quando o arquivo chega.
 */
export function BaixarParaADominio({ href, formato, rotulo, variant = "secondary", confirmar }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [baixando, setBaixando] = useState(false);
  const [perguntando, setPerguntando] = useState(false);

  async function baixar() {
    setBaixando(true);
    try {
      const resposta = await fetch(href);
      if (!resposta.ok) throw new Error();
      const arquivo = await resposta.blob();
      const nome = /filename="?([^";]+)"?/.exec(resposta.headers.get("Content-Disposition") ?? "")?.[1] ?? `dominio.${formato}`;
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      link.click();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch {
      toast.error("Não foi possível gerar a planilha. Tente de novo.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size="sm"
        loading={baixando}
        loadingLabel="Gerando…"
        onClick={() => (confirmar ? setPerguntando(true) : void baixar())}
      >
        {formato === "xlsx" ? <FileSpreadsheet size={14} /> : <FileText size={14} />} {rotulo}
      </Button>
      {confirmar && (
        <ConfirmDialog
          open={perguntando}
          title={confirmar.titulo}
          description={confirmar.descricao}
          confirmLabel={confirmar.botao}
          destructive
          onConfirm={() => {
            setPerguntando(false);
            void baixar();
          }}
          onCancel={() => setPerguntando(false)}
        />
      )}
    </>
  );
}
