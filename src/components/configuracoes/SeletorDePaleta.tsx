"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SeletorDeCor } from "@/components/ui/SeletorDeCor";
import { useToast } from "@/components/ui/Toast";
import { salvarMinhaPaleta } from "@/app/(app)/configuracoes/actions";
import { PALETAS, paletaDaCor } from "@/lib/aparencia/paletas";

/**
 * A paleta da pessoa (30/10/2026), como os temas do Slack: a cor de destaque e
 * o tom da lateral, só para ela. Clicar já aplica; "Do escritório" volta à cor
 * que o escritório escolheu (ou ao azul de sempre).
 */
export function SeletorDePaleta({ atual }: { atual: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [escolhida, setEscolhida] = useState<string | null>(atual);
  const [propria, setPropria] = useState(atual && !paletaDaCor(atual) ? atual : "#E91E63");
  const [pendente, iniciar] = useTransition();

  function aplicar(cor: string | null) {
    const antes = escolhida;
    setEscolhida(cor);
    iniciar(async () => {
      const r = await salvarMinhaPaleta(cor);
      if (r && "error" in r) {
        setEscolhida(antes);
        toast.error(r.error);
        return;
      }
      router.refresh();
    });
  }

  const ehPropria = escolhida !== null && !paletaDaCor(escolhida);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ui text-fg-secondary">
        A cor de destaque (botões, aba aberta, item do menu) e o tom da lateral, só para você. As cores das áreas não mudam.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Paleta" aria-busy={pendente || undefined}>
        <Amostra nome="Do escritório" ativa={escolhida === null} onClick={() => aplicar(null)} disabled={pendente} />
        {PALETAS.map((p) => (
          <Amostra key={p.codigo} nome={p.nome} cor={p.cor} ativa={escolhida === p.cor} onClick={() => aplicar(p.cor)} disabled={pendente} />
        ))}
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${ehPropria ? "border-brand bg-brand/5" : "border-border"}`}
        >
          <SeletorDeCor id="paleta-propria" modo="botao" corLivre valor={propria} onChange={setPropria} aria-label="Cor própria" />
          <Button size="xs" variant="secondary" disabled={pendente} onClick={() => aplicar(propria.toUpperCase())}>
            Usar esta
          </Button>
        </div>
      </div>
    </div>
  );
}

function Amostra({ nome, cor, ativa, onClick, disabled }: { nome: string; cor?: string; ativa: boolean; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativa}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-[var(--c41-disabled-op)] ${
        ativa ? "border-brand bg-brand/5" : "border-border hover:border-border-strong hover:bg-surface-hover"
      }`}
    >
      <span
        aria-hidden
        className="size-5 flex-shrink-0 rounded-full border border-border"
        style={{ background: cor ?? "conic-gradient(from 90deg, var(--c41-brand-600), var(--c41-brand-300), var(--c41-brand-600))" }}
      />
      <span className="min-w-0 flex-1 truncate text-ui font-medium text-fg">{nome}</span>
      {ativa && <Check size={14} className="flex-shrink-0 text-brand" />}
    </button>
  );
}
