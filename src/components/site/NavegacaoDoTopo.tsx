"use client";

import { useEffect, useId, useState } from "react";
import { Menu, X } from "lucide-react";

// As âncoras do topo do site (13/10/2026, versão 3). No computador, uma linha
// no meio do topo; abaixo de 1024 px, um menu que abre embaixo do topo — o
// botão de entrar fica de fora, sempre à vista (pedido do Kauan: gente da 41
// não achou como entrar e desceu até o rodapé).
//
// Uma lista só para os dois tamanhos: no computador ela está sempre aberta, e
// o botão do menu some. Fecha com Esc e ao escolher uma seção.

export type SecaoDoTopo = { id: string; rotulo: string };

export function NavegacaoDoTopo({ secoes }: { secoes: SecaoDoTopo[] }) {
  const [aberto, setAberto] = useState(false);
  const idDaLista = useId();

  useEffect(() => {
    if (!aberto) return;
    const fecharNoEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", fecharNoEsc);
    return () => window.removeEventListener("keydown", fecharNoEsc);
  }, [aberto]);

  return (
    <nav aria-label="Seções da página" className="order-last lg:order-none lg:mx-auto">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        aria-label="Menu"
        onClick={() => setAberto((a) => !a)}
        className="flex size-10 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
      >
        {aberto ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
      </button>
      <ul
        id={idDaLista}
        className={`${aberto ? "c41-surgir flex" : "hidden"} absolute inset-x-0 top-full flex-col gap-0.5 border-b border-border bg-[var(--c41-site-fundo)] px-3 pb-4 pt-2 shadow-[var(--c41-shadow-md)] lg:static lg:flex lg:flex-row lg:items-center lg:gap-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
      >
        {secoes.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={() => setAberto(false)}
              className="block rounded-lg px-3 py-3 text-fs-6 font-medium text-fg transition-colors hover:bg-surface-hover hover:text-brand lg:rounded-md lg:px-0 lg:py-1 lg:text-fs-4 lg:text-fg-secondary lg:hover:bg-transparent"
            >
              {s.rotulo}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
