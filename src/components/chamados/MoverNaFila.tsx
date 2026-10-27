"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { mudar } from "@/app/(app)/chamados/actions";

// A ordem da fila é decidida aqui na lista, pela equipe que gerencia
// (26/10/2026): subir ou descer uma posição grava para todos, pela mesma
// operação "fila" que reordena e renumera os chamados na fila.
export function MoverNaFila({ id, version, posicao, total, titulo }: { id: string; version: number; posicao: number; total: number; titulo: string }) {
  const router = useRouter(), toast = useToast(); const [busy, setBusy] = useState(false);
  async function mover(destino: number) {
    setBusy(true);
    try { const r = await mudar(id, version, "fila", destino); if (!r.ok) throw new Error(r.error); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível mover o chamado. Atualize a página."); }
    finally { setBusy(false); }
  }
  return <div className="flex shrink-0 flex-col" role="group" aria-label={`Posição de ${titulo} na fila`}>
    <IconButton size="sm" title="Subir na fila" aria-label={`Subir ${titulo} na fila`} disabled={busy || posicao <= 1} onClick={() => void mover(posicao - 1)}><ChevronUp size={16} /></IconButton>
    <IconButton size="sm" title="Descer na fila" aria-label={`Descer ${titulo} na fila`} disabled={busy || posicao >= total} onClick={() => void mover(posicao + 1)}><ChevronDown size={16} /></IconButton>
  </div>;
}
