"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { alternarTelaFixada } from "@/app/(app)/telas-fixadas-actions";

/**
 * O alfinete do cartão de uma tela, no hub do setor.
 *
 * Irmão do `<Link>` do cartão, nunca filho: `<button>` dentro de `<a>` é HTML
 * inválido e o clique navegaria junto — mesmo motivo do menu "…" dos espaços.
 *
 * O estado muda na hora (a pessoa vê o alfinete preencher) e o
 * `router.refresh()` vai buscar a sidebar nova; se a ação recusar (teto de
 * fixadas), volta ao que era e diz por quê.
 */
export function BotaoFixarTela({ code, fixada: inicial }: { code: string; fixada: boolean }) {
  const [fixada, setFixada] = useState(inicial);
  const [salvando, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <button
      type="button"
      aria-pressed={fixada}
      title={fixada ? "Soltar da sidebar" : "Fixar na sidebar"}
      aria-label={fixada ? "Soltar da sidebar" : "Fixar na sidebar"}
      disabled={salvando}
      onClick={() => {
        const alvo = !fixada;
        setFixada(alvo);
        startTransition(async () => {
          const r = await alternarTelaFixada(code);
          if ("error" in r) {
            setFixada(!alvo);
            toast.error(r.error);
            return;
          }
          setFixada(r.fixada);
          router.refresh();
        });
      }}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors ${
        fixada
          ? "text-brand hover:bg-brand/10"
          : "text-fg-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {fixada ? <Pin size={15} className="fill-current" /> : <PinOff size={15} />}
    </button>
  );
}
