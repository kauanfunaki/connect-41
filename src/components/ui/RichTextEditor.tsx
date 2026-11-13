"use client";

// O editor de texto rico das telas (descrição da tarefa, documento para o
// cliente, metodologia do fluxo, Manual BPO), carregado sob demanda (13/11/2026,
// Controle interno melhoria-661). O Tiptap pesa ~140 KB gzip
// (`RichTextEditorTiptap.tsx`) e ia no JS da tela inteira; agora o navegador só
// busca quando o campo aparece, e o servidor manda um esqueleto do tamanho dele.
//
// Antes já era assim no servidor: com `immediatelyRender: false` o Tiptap não
// desenha nada fora do navegador. O `ssr: false` só tira o pacote da tela.

import { createContext, useContext } from "react";
import dynamic from "next/dynamic";
import type { RichTextEditorProps } from "./RichTextEditorTiptap";

export type { RichTextEditorProps };

// O `loading` do next/dynamic não recebe as props do componente: o esqueleto
// as lê daqui, para ter o tamanho do campo e o hidden do formulário.
const PropsDoEditor = createContext<RichTextEditorProps>({});

const EditorCarregado = dynamic(() => import("./RichTextEditorTiptap").then((m) => m.RichTextEditorTiptap), {
  ssr: false,
  loading: EsqueletoDoEditor,
});

export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <PropsDoEditor.Provider value={props}>
      <EditorCarregado {...props} />
    </PropsDoEditor.Provider>
  );
}

const BARRA = "rounded-sm bg-surface-2 motion-safe:animate-pulse";

/**
 * O lugar do editor enquanto o Tiptap chega: a mesma moldura, a barra com os
 * cinco botões e a altura mínima do texto, para a tela não pular quando ele
 * monta. O hidden vai junto: um formulário enviado nesse meio-tempo leva o
 * valor que já estava, como antes.
 */
function EsqueletoDoEditor() {
  const { name, defaultValue = "", chrome = "boxed", blockDragHandle = false, contentClass } = useContext(PropsDoEditor);
  const hidden = name ? <input type="hidden" name={name} value={defaultValue} readOnly /> : null;
  const carregando = <span className="sr-only">Carregando o editor de texto…</span>;

  if (chrome === "bare") {
    return (
      <div className="relative" role="status" aria-busy="true">
        {carregando}
        <div aria-hidden className={`flex flex-col gap-3 ${blockDragHandle ? "pl-9 -ml-9" : ""} ${contentClass ?? ""}`.trim()}>
          <span className={`block h-4 w-11/12 ${BARRA}`} />
          <span className={`block h-4 w-4/5 ${BARRA}`} />
          <span className={`block h-4 w-3/5 ${BARRA}`} />
        </div>
        {hidden}
      </div>
    );
  }

  return (
    <div className="relative border border-border-strong rounded-md bg-input-bg overflow-hidden" role="status" aria-busy="true">
      {carregando}
      <div aria-hidden className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`size-7 ${BARRA}`} />
        ))}
      </div>
      <div aria-hidden className={`min-h-[160px] ${blockDragHandle ? "pl-9" : "px-3"} py-2`}>
        <span className={`mt-1.5 block h-3.5 w-3/4 ${BARRA}`} />
        <span className={`mt-2.5 block h-3.5 w-1/2 ${BARRA}`} />
      </div>
      {hidden}
    </div>
  );
}
