"use client";

import { useTransition } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removerRegra } from "@/app/(app)/contabil/sped/actions";

/** Volta a lançar o que foi deixado de fora — apaga a regra de exclusão. */
export function DesfazerDescarte({ empresaId, regraId }: { empresaId: string; regraId: string }) {
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pendente} onClick={() => iniciar(async () => { const r = await removerRegra({ empresa: empresaId, id: regraId }); if (r.ok) toast.success(r.mensagem); else toast.error(r.erro); })}>
      <Undo2 size={14} aria-hidden /> Voltar a lançar
    </Button>
  );
}
