"use client";

import { useState } from "react";
import { applyPreferencia, readPreferencia, type PreferenciaDeTema } from "@/lib/theme";

// Cores fixas da miniatura, e não os tokens: o cartão de "escuro" tem de
// parecer escuro mesmo com a tela em tema claro, e vice-versa. São os valores
// de --c41-canvas / sidebar / surface / border de cada tema (globals.css).
const CLARO = { fundo: "#F4F3F7", lateral: "#FFFFFF", cartao: "#FFFFFF", linha: "#E4E1EA", texto: "#D3CFDC" };
const ESCURO = { fundo: "#141219", lateral: "#18151D", cartao: "#1C1A22", linha: "#2A2732", texto: "#3A3643" };
const MARCA = "#1F5EEA";

type Paleta = typeof CLARO;

/** Uma tela do Connect em miniatura: sidebar, título, dois cartões e linhas. */
function Miniatura({ p }: { p: Paleta }) {
  return (
    <div className="flex h-full w-full" style={{ background: p.fundo }}>
      <div className="w-[26%] h-full flex flex-col gap-1.5 p-2" style={{ background: p.lateral, borderRight: `1px solid ${p.linha}` }}>
        <span className="block h-1.5 w-3/4 rounded-full" style={{ background: MARCA }} />
        <span className="block h-1 w-full rounded-full mt-1" style={{ background: p.texto }} />
        <span className="block h-1 w-5/6 rounded-full" style={{ background: p.texto }} />
        <span className="block h-1 w-2/3 rounded-full" style={{ background: p.texto }} />
      </div>
      <div className="flex-1 p-2.5 flex flex-col gap-2">
        <span className="block h-1 w-5 rounded-full" style={{ background: MARCA }} />
        <span className="block h-2 w-1/2 rounded-full" style={{ background: p.texto }} />
        <div className="flex gap-1.5">
          <span className="block h-7 flex-1 rounded" style={{ background: p.cartao, border: `1px solid ${p.linha}` }} />
          <span className="block h-7 flex-1 rounded" style={{ background: p.cartao, border: `1px solid ${p.linha}` }} />
        </div>
        <span className="block h-1 w-full rounded-full" style={{ background: p.linha }} />
        <span className="block h-1 w-4/5 rounded-full" style={{ background: p.linha }} />
      </div>
    </div>
  );
}

const OPCOES: { valor: PreferenciaDeTema; rotulo: string; previa: React.ReactNode }[] = [
  {
    valor: "system",
    rotulo: "Padrão do sistema",
    // Metade de cada: é o tema que muda com o aparelho.
    previa: (
      <div className="relative h-full w-full">
        <Miniatura p={ESCURO} />
        <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-[200%]">
            <Miniatura p={CLARO} />
          </div>
        </div>
      </div>
    ),
  },
  { valor: "dark", rotulo: "Modo escuro", previa: <Miniatura p={ESCURO} /> },
  { valor: "light", rotulo: "Modo claro", previa: <Miniatura p={CLARO} /> },
];

/**
 * A escolha do tema em cartões com a tela em miniatura — o mesmo cookie do
 * botão da topbar. Pedido de 30/09 (referência das configurações do HubStrom):
 * escolher vendo, e não por um rótulo. "Padrão do sistema" segue o aparelho.
 */
export function TemaSelector() {
  // O servidor não tem cookie de documento nem DOM; no cliente a preferência
  // real já está aplicada no <html>. O cliente vence de propósito.
  const [preferencia, setPreferencia] = useState<PreferenciaDeTema>(readPreferencia);

  function escolher(valor: PreferenciaDeTema) {
    setPreferencia(valor);
    applyPreferencia(valor);
  }

  return (
    <div role="radiogroup" aria-label="Tema" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {OPCOES.map((o) => {
        const ativo = preferencia === o.valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => escolher(o.valor)}
            suppressHydrationWarning
            className={`group flex flex-col overflow-hidden rounded-lg border text-left transition-[border-color,box-shadow] ${
              ativo
                ? "border-brand shadow-[0_0_0_3px_var(--c41-focus-ring)]"
                : "border-border-strong hover:border-brand/50"
            }`}
          >
            <span className="block h-[104px] w-full overflow-hidden border-b border-border">{o.previa}</span>
            <span className="flex items-center gap-2.5 px-3.5 py-3 bg-surface">
              <span
                aria-hidden
                suppressHydrationWarning
                className={`inline-flex size-4 items-center justify-center rounded-full border-2 transition-colors ${
                  ativo ? "border-brand" : "border-border-strong group-hover:border-brand/50"
                }`}
              >
                {ativo && <span className="size-2 rounded-full bg-brand" />}
              </span>
              <span className={`text-fs-3 font-semibold ${ativo ? "text-fg" : "text-fg-secondary"}`}>{o.rotulo}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
