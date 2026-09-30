"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { carregarPlanoPadrao } from "@/app/(app)/admin/plano-de-contas/actions";

/**
 * Carrega o plano padrão da 41 no escritório. Pede confirmação na própria tela
 * (o `confirm()` do navegador não serve aqui) e diz o que mudou.
 */
export function CarregarPlanoPadrao() {
  const [confirmando, setConfirmando] = useState(false);
  const [mensagem, setMensagem] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!confirmando) {
    // Secundário com ícone: no cabeçalho, o primário é "+ Nova categoria" —
    // dois azuis cheios lado a lado não diziam qual era a ação da tela.
    return (
      <span className="inline-flex items-center gap-2">
        <Button variant="secondary" onClick={() => { setMensagem(null); setConfirmando(true); }}>
          <Download size={14} /> Carregar o plano padrão da 41
        </Button>
        {mensagem && <span className={`text-[12px] ${mensagem.ok ? "text-success" : "text-danger"}`}>{mensagem.texto}</span>}
      </span>
    );
  }

  // Botões md, e não sm: dividem o cabeçalho com o "+ Nova categoria", que é
  // md — dois tamanhos na mesma linha. Cancelar antes do primário.
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px] text-fg-secondary">
      <span className="max-w-[46ch]">Cria as 189 categorias do plano padronizado que faltarem. Nada que já existe é apagado ou reclassificado.</span>
      <Button variant="secondary" onClick={() => setConfirmando(false)}>
        Cancelar
      </Button>
      <Button
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            const r = await carregarPlanoPadrao();
            setMensagem("error" in r ? { ok: false, texto: r.error } : { ok: true, texto: r.mensagem });
            setConfirmando(false);
          })
        }
      >
        Carregar
      </Button>
    </span>
  );
}
