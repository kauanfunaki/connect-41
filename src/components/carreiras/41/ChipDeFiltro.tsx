"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

export type OpcaoDoChip = { rotulo: string; href: string; atual: boolean; vagas?: number };

/**
 * Um filtro da lista do 41 Carreiras, como pílula com menu (15/10/2026): o
 * botão mostra o filtro ("Modelo" ou "Modelo: Remoto") e abre a lista das
 * opções — cada uma é um link para a lista já filtrada, então a URL guarda o
 * filtro, o servidor filtra e o link pode ser compartilhado. Nada do seletor
 * do navegador. No celular, o menu abre como folha embaixo da tela.
 */
export function ChipDeFiltro({ rotulo, valor, opcoes, direita = false }: { rotulo: string; valor: string | null; opcoes: OpcaoDoChip[]; direita?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className={`t41-chip${valor ? " t41-chip--ativo" : ""}${direita ? " t41-chip--direita" : ""}`}>
      <button
        ref={botao}
        type="button"
        className="t41-chip__botao"
        aria-expanded={aberto}
        aria-controls={id}
        onClick={() => setAberto((a) => !a)}
      >
        {valor ? (
          <>
            {rotulo}: <span style={{ fontWeight: 800 }}>{valor}</span>
          </>
        ) : (
          rotulo
        )}
        <ChevronDown size={16} className="t41-chip__seta" aria-hidden="true" />
      </button>
      {aberto && (
        <>
          <div className="t41-chip__fundo" aria-hidden="true" onClick={() => setAberto(false)} />
          <div id={id} className="t41-chip__painel" role="group" aria-label={rotulo}>
            <p className="t41-chip__titulo">{rotulo}</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {opcoes.map((o) => (
                <li key={o.href + o.rotulo}>
                  <Link
                    href={o.href}
                    scroll={false}
                    className="t41-chip__opcao"
                    aria-current={o.atual ? "true" : undefined}
                    onClick={() => setAberto(false)}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      {o.atual && <Check size={16} aria-hidden="true" />}
                      {o.rotulo}
                    </span>
                    {o.vagas !== undefined && <small>{o.vagas === 1 ? "1 vaga" : `${o.vagas} vagas`}</small>}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
