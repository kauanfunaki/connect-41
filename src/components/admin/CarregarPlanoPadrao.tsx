"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { carregarPlanoPadrao } from "@/app/(app)/admin/plano-de-contas/actions";

/**
 * Carrega o plano padrão da 41 no escritório.
 *
 * Pede confirmação na janela de confirmação do Connect, e o que mudou chega
 * num aviso que some (15/10/2026). Eram o texto e os botões abertos dentro do
 * cabeçalho, e o resultado num texto colorido ao lado do botão. O erro fica
 * na própria janela, como nas outras confirmações.
 */
export function CarregarPlanoPadrao() {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();

  return (
    <>
      {/* Secundário com ícone: no cabeçalho, o primário é "+ Nova categoria" —
          dois azuis cheios lado a lado não diziam qual era a ação da tela. */}
      <Button
        variant="secondary"
        onClick={() => {
          setErro(null);
          setConfirmando(true);
        }}
      >
        <Download size={14} /> Carregar o plano padrão
      </Button>
      <ConfirmDialog
        open={confirmando}
        title="Carregar o plano padrão?"
        description="Cria as 189 categorias do plano padronizado que faltarem. Nada que já existe é apagado ou reclassificado."
        confirmLabel="Carregar"
        pendingLabel="Carregando…"
        pending={pendente}
        error={erro}
        onConfirm={() =>
          startTransition(async () => {
            const r = await carregarPlanoPadrao();
            if ("error" in r) {
              setErro(r.error);
              return;
            }
            setConfirmando(false);
            toast.success(r.mensagem);
          })
        }
        onCancel={() => setConfirmando(false)}
      />
    </>
  );
}
