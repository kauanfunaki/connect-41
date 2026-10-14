"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

/** O menu do topo no celular: as mesmas entradas do topo largo, numa folha abaixo dele. */
export function MenuDoTopo({ links }: { links: { href: string; rotulo: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto]);

  return (
    <>
      <button
        ref={botao}
        type="button"
        className="t41-menu-botao"
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={aberto ? "Fechar o menu" : "Abrir o menu"}
        onClick={() => setAberto((a) => !a)}
      >
        {aberto ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
      </button>
      {aberto && (
        <nav id={id} className="t41-menu-painel" aria-label="Menu">
          <div className="t41-caixa">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setAberto(false)}>
                {l.rotulo}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
