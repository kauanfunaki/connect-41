"use client";

import { useState, useSyncExternalStore } from "react";
import { Moon, Smartphone, Sun } from "lucide-react";
import { applyPreferencia, readPreferencia, type PreferenciaDeTema } from "@/lib/theme";

const OPCOES: { valor: PreferenciaDeTema; rotulo: string; icone: React.ReactNode }[] = [
  { valor: "system", rotulo: "Do aparelho", icone: <Smartphone /> },
  { valor: "light", rotulo: "Claro", icone: <Sun /> },
  { valor: "dark", rotulo: "Escuro", icone: <Moon /> },
];

// A preferência mora no cookie, que o servidor desta tela não lê: no servidor
// nenhuma opção sai marcada, e o navegador marca a gravada logo depois da
// hidratação — sem a diferença entre os dois que o React acusaria.
const semAssinatura = () => () => {};
const nadaNoServidor = () => null;

/**
 * O tema do portal em Minha conta (12A da página de decisões, 08/10/2026):
 * Do aparelho · Claro · Escuro, e "Do aparelho" é o padrão de quem nunca
 * escolheu (ver `lib/theme.ts`). O mesmo cookie da equipe.
 *
 * Rádios de verdade, no desenho da escolha de cliente do login: cada opção é
 * um alvo de 44px, com a escolhida marcada na borda — a tela é aberta no
 * celular. Escolher já aplica; não há "salvar".
 */
export function TemaDoPortal() {
  const gravada = useSyncExternalStore(semAssinatura, readPreferencia, nadaNoServidor);
  const [escolhida, setEscolhida] = useState<PreferenciaDeTema | null>(null);
  const atual = escolhida ?? gravada;

  function escolher(valor: PreferenciaDeTema) {
    setEscolhida(valor);
    applyPreferencia(valor);
  }

  return (
    <fieldset>
      <legend className="sr-only">Tema do portal</legend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {OPCOES.map((o) => (
          <label
            key={o.valor}
            className="flex items-center gap-3 min-h-11 rounded-md border border-border-strong px-3 py-2 cursor-pointer transition-colors hover:bg-surface-hover has-[:checked]:border-brand has-[:checked]:bg-brand/8"
          >
            <input
              type="radio"
              name="tema"
              value={o.valor}
              checked={atual === o.valor}
              onChange={() => escolher(o.valor)}
              className="size-4 flex-shrink-0 accent-[var(--c41-brand)]"
            />
            <span aria-hidden className="text-fg-secondary [&>svg]:size-4">
              {o.icone}
            </span>
            <span className="text-body text-fg">{o.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
