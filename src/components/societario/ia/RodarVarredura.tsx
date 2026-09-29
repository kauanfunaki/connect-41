"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import type { AcaoDaIa } from "@/app/(app)/societario/ia/actions";

/** "Rodar varredura": se houver pendência, a action leva direto à revisão. */
export function RodarVarredura({ rodar, desligada }: { rodar: () => Promise<AcaoDaIa>; desligada: boolean }) {
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="primary"
        disabled={pendente || desligada}
        onClick={() => {
          setMsg(null);
          startTransition(async () => {
            const r = await rodar();
            if (r && "error" in r) setMsg({ tipo: "erro", texto: r.error });
            else if (r?.mensagem) setMsg({ tipo: "ok", texto: r.mensagem });
          });
        }}
      >
        {pendente ? "Varrendo…" : "Rodar varredura"}
      </Button>
      {msg && <p className={`text-[12px] max-w-sm text-right ${msg.tipo === "erro" ? "text-danger" : "text-fg-muted"}`}>{msg.texto}</p>}
    </div>
  );
}
