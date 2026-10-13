"use client";

import { useState } from "react";
import { FolderDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * "Baixar pasta (.zip)" — na equipe e no portal (13/10/2026). Pergunta antes à
 * rota se dá (`?conferir=1`): pasta vazia ou acima do teto vira um aviso com o
 * motivo, em vez de um download que falha sem explicação. Dando, o navegador
 * baixa o zip pela mesma rota, aos pedaços, sem sair da tela.
 *
 * `url`: a rota do zip — /api/arquivos/pasta/{id}/zip ou /portal/arquivos/pasta/{id}/zip.
 */
export function BaixarPastaEmZip({ url }: { url: string }) {
  const toast = useToast();
  const [conferindo, setConferindo] = useState(false);

  async function baixar() {
    setConferindo(true);
    try {
      const resposta = await fetch(`${url}?conferir=1`, { cache: "no-store" });
      const corpo = (await resposta.json().catch(() => null)) as { error?: string; nome?: string; arquivos?: number } | null;
      if (!resposta.ok) {
        toast.error(corpo?.error ?? "Não deu para baixar a pasta. Tente de novo.");
        return;
      }
      // `download` no link: se algo mudar entre a conferência e o download, o
      // navegador mostra a falha na lista de downloads em vez de abrir a
      // resposta de erro no lugar da tela.
      const link = document.createElement("a");
      link.href = url;
      link.download = corpo?.nome ?? "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      const quantos = corpo?.arquivos === 1 ? "1 arquivo" : `${corpo?.arquivos ?? 0} arquivos`;
      toast.success(`Baixando o zip com ${quantos}. Pasta grande pode levar alguns minutos.`);
    } catch {
      toast.error("Sem conexão com o servidor. Tente de novo.");
    } finally {
      setConferindo(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={baixar} loading={conferindo} loadingLabel="Preparando…">
      <FolderDown size={14} /> Baixar pasta (.zip)
    </Button>
  );
}
