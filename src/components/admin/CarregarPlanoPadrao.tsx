"use client";

import { useState, useTransition } from "react";
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
    return (
      <span className="inline-flex items-center gap-2">
        <Button size="sm" onClick={() => { setMensagem(null); setConfirmando(true); }}>
          Carregar o plano padrão da 41
        </Button>
        {mensagem && <span className={`text-[12px] ${mensagem.ok ? "text-success" : "text-danger"}`}>{mensagem.texto}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-[12px] text-fg-secondary">
      <span>Cria as 189 categorias do plano padronizado que faltarem. Nada que já existe é apagado ou reclassificado.</span>
      <Button
        size="sm"
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
      <Button variant="linkMuted" size="xs" onClick={() => setConfirmando(false)}>
        Cancelar
      </Button>
    </span>
  );
}
