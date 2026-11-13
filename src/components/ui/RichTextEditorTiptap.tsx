"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import type { EditorView } from "@tiptap/pm/view";
import { TextSelection } from "@tiptap/pm/state";
import { alturaDaLinha, destinoDoBloco, indiceDeInsercao, virouArraste, type CaixaDoBloco } from "./arrasteDeBlocos";

// O editor de verdade (Tiptap, StarterKit e ProseMirror: ~140 KB gzip). Não
// importar direto: as telas usam `RichTextEditor` (./RichTextEditor.tsx), que
// carrega este arquivo sob demanda, só no navegador (13/11/2026, Controle
// interno melhoria-661). Importado de forma estática, ele ia no JS da tela
// inteira, mesmo quando o campo nem aparece (descrição fechada da tarefa).

export type RichTextEditorProps = {
  /** Sincroniza um <input type="hidden"> pra submissão via <form>. Omitido
   *  quando o consumidor persiste por conta própria (ver `onChange`). */
  name?: string;
  defaultValue?: string;
  // Ativa o puxador de arrastar bloco (estilo Notion) — reordena os nós de
  // nível 1 do documento (parágrafos, títulos, listas...) arrastando o
  // puxador (eventos de ponteiro, 06/11/2026: ver `arrasteDeBlocos.ts`).
  // Opt-in: os outros usos deste editor (descrição de tarefa, documento pro
  // cliente) continuam sem isso, só o Manual BPO pediu.
  blockDragHandle?: boolean;
  /**
   * "boxed" (padrão): moldura de campo de formulário + barra de ferramentas
   * fixa no topo. É o certo quando o editor é um campo entre outros.
   *
   * "bare": sem moldura e sem barra fixa — o texto fica no fluxo da página e a
   * barra aparece flutuando só sobre a seleção. É o modo de documento (Manual
   * BPO), onde uma caixa de formulário no meio da página quebra a leitura.
   */
  chrome?: "boxed" | "bare";
  editable?: boolean;
  /** Chamado a cada alteração com o HTML atual. */
  onChange?: (html: string) => void;
  /** Classes extras no elemento do ProseMirror — tipografia do consumidor. */
  contentClass?: string;
};

// Precisa ser uma referência estável (fora do componente) — se recriado a cada
// render, o useEditor do Tiptap enxerga "extensions mudou" e destrói/recria o
// editor infinitamente (nunca chega a montar o ProseMirror no DOM de verdade).
const EXTENSIONS = [StarterKit];

function ToolbarButton({
  onClick,
  active,
  children,
  label,
}: {
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      // preventDefault no mousedown evita que o clique na toolbar tire o foco
      // do editor antes do comando (bold/heading/etc.) rodar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        active ? "bg-brand/15 text-brand" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

// Os mesmos comandos servem à barra fixa do modo "boxed" e à barra flutuante
// do modo "bare" — um componente só evita as duas listas saírem de sincronia.
function FormatButtons({ editor }: { editor: Editor }) {
  return (
    <>
      <ToolbarButton label="Negrito" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
        <Bold size={14} />
      </ToolbarButton>
      <ToolbarButton label="Itálico" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
        <Italic size={14} />
      </ToolbarButton>
      <ToolbarButton
        label="Título"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
      >
        <Heading2 size={14} />
      </ToolbarButton>
      <ToolbarButton label="Lista com marcadores" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
        <List size={14} />
      </ToolbarButton>
      <ToolbarButton label="Lista numerada" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
        <ListOrdered size={14} />
      </ToolbarButton>
    </>
  );
}

// Posição (no doc do ProseMirror) logo antes do n-ésimo filho de nível 1.
function posForIndex(doc: EditorView["state"]["doc"], index: number): number {
  let pos = 0;
  for (let i = 0; i < doc.childCount; i++) {
    if (i === index) return pos;
    pos += doc.child(i).nodeSize;
  }
  return doc.content.size;
}

// Acha em qual bloco de nível 1 (parágrafo, título, item de lista...) as
// coordenadas de tela caem — devolve o índice do bloco e o elemento DOM dele,
// usado tanto pra posicionar o puxador quanto pra decidir onde soltar.
/**
 * Move o bloco `de` para a posição `para` (índices de nível 1) e deixa o cursor
 * dentro dele. É o "Mover para cima/baixo" do puxador e o Alt+↑/↓ (lote C dos
 * ajustes de 03/11/2026): arrastar pede mira; isto, não.
 */
function moverBloco(view: EditorView, de: number, para: number): boolean {
  const doc = view.state.doc;
  if (para < 0 || para >= doc.childCount || para === de) return false;
  const node = doc.child(de);
  const tr = view.state.tr.delete(posForIndex(doc, de), posForIndex(doc, de) + node.nodeSize);
  const insertPos = posForIndex(tr.doc, para);
  tr.insert(insertPos, node.type.create(node.attrs, node.content, node.marks));
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

/** A caixa de cada bloco de nível 1, na tela, na ordem do documento. */
function caixasDosBlocos(view: EditorView): CaixaDoBloco[] {
  const doc = view.state.doc;
  const caixas: CaixaDoBloco[] = [];
  for (let i = 0; i < doc.childCount; i++) {
    const dom = view.nodeDOM(posForIndex(doc, i));
    if (dom instanceof HTMLElement) {
      const r = dom.getBoundingClientRect();
      caixas.push({ top: r.top, height: r.height });
    } else {
      // Sem elemento (raro): uma caixa vazia logo abaixo da anterior, para o índice não escorregar.
      const anterior = caixas[caixas.length - 1];
      caixas.push({ top: anterior ? anterior.top + anterior.height : 0, height: 0 });
    }
  }
  return caixas;
}

function hoveredBlock(view: EditorView, clientX: number, clientY: number) {
  const posInfo = view.posAtCoords({ left: clientX, top: clientY });
  if (!posInfo) return null;
  const $pos = view.state.doc.resolve(posInfo.pos);
  const index = $pos.index(0);
  const nodeStartPos = $pos.before(1);
  const dom = view.nodeDOM(nodeStartPos);
  if (!(dom instanceof HTMLElement)) return null;
  return { index, dom };
}

// Editor rich text (Tiptap) com um <input type="hidden"> sincronizado — assim
// funciona dentro de um <form action={...}> comum (useActionState), sem
// precisar de submit via JS. O HTML gerado é sanitizado de novo no servidor
// (src/lib/clientDocuments.ts) antes de ser persistido.
export function RichTextEditorTiptap({
  name,
  defaultValue = "",
  blockDragHandle = false,
  chrome = "boxed",
  editable = true,
  onChange,
  contentClass,
}: RichTextEditorProps) {
  const [html, setHtml] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // O arraste em curso (06/11/2026). Ref (não state) porque é lido dentro de
  // callbacks do ProseMirror e dos eventos de ponteiro, que precisam do valor
  // mais recente na hora. `ativo` só depois do limiar: antes disso é clique.
  const arrasteRef = useRef<{ de: number; x: number; y: number; ativo: boolean; insercao: number } | null>(null);
  // O clique que o navegador dispara depois de soltar um arraste não abre o menu.
  const acabouDeArrastarRef = useRef(false);
  // A linha que mostra onde o bloco vai cair, relativa ao wrapper.
  const [linha, setLinha] = useState<number | null>(null);
  const [handle, setHandle] = useState<{ top: number; index: number } | null>(null);
  // O bloco com o menu "Mover para cima/baixo" aberto.
  const [menuDoBloco, setMenuDoBloco] = useState<number | null>(null);
  const bare = chrome === "bare";

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: bare
          ? `outline-none ${blockDragHandle ? "pl-9 -ml-9" : ""} ${contentClass ?? ""}`.trim()
          : `min-h-[160px] ${blockDragHandle ? "pl-9" : "px-3"} py-2 text-label text-fg outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-fs-6 [&_h2]:font-semibold [&_h2]:mt-2 [&_p]:my-1 ${contentClass ?? ""}`.trim(),
      },
      ...(blockDragHandle
        ? {
            // Alt+↑ / Alt+↓ move o bloco onde está o cursor.
            handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
              if (!event.altKey || event.ctrlKey || event.metaKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return false;
              const de = view.state.selection.$from.index(0);
              return moverBloco(view, de, de + (event.key === "ArrowUp" ? -1 : 1));
            },
            handleDOMEvents: {
              mousemove: (view: EditorView, event: Event) => {
                if (arrasteRef.current) return false;
                const e = event as MouseEvent;
                const wrapper = wrapperRef.current;
                const hovered = hoveredBlock(view, e.clientX, e.clientY);
                if (!hovered || !wrapper) {
                  setHandle(null);
                  return false;
                }
                const rect = hovered.dom.getBoundingClientRect();
                const wrapperRect = wrapper.getBoundingClientRect();
                setHandle({ top: rect.top - wrapperRect.top + wrapper.scrollTop, index: hovered.index });
                return false;
              },
            },
          }
        : {}),
    }),
    [blockDragHandle, bare, contentClass]
  );

  // `onChange` numa ref: passar a prop direto pro onUpdate faria o handler
  // mudar de identidade a cada render do consumidor, e o useEditor recriaria a
  // configuração no meio da digitação.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: defaultValue,
    immediatelyRender: false,
    editable,
    onUpdate: ({ editor }) => {
      const next = editor.getHTML();
      setHtml(next);
      onChangeRef.current?.(next);
    },
    editorProps,
  });

  // ─── Arrastar pelo puxador (eventos de ponteiro, 06/11/2026) ───────────────
  // Apertar e mover passa do limiar → arraste, com a linha de destino; soltar
  // move o bloco pelo mesmo `moverBloco` do menu. Sem mover → clique (o menu).
  // Mouse e toque; Esc cancela.

  function cancelarArraste() {
    if (arrasteRef.current?.ativo) acabouDeArrastarRef.current = true;
    arrasteRef.current = null;
    setLinha(null);
  }

  function onHandlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || handle == null) return;
    // Sem tirar o foco nem a seleção do texto; a captura segue o ponteiro fora do puxador.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasteRef.current = { de: handle.index, x: e.clientX, y: e.clientY, ativo: false, insercao: handle.index };
  }

  function onHandlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const a = arrasteRef.current;
    const wrapper = wrapperRef.current;
    if (!a || !editor || !wrapper) return;
    if (!a.ativo) {
      if (!virouArraste(e.clientX - a.x, e.clientY - a.y)) return;
      a.ativo = true;
      setMenuDoBloco(null);
    }
    const caixas = caixasDosBlocos(editor.view);
    a.insercao = indiceDeInsercao(caixas, e.clientY);
    const y = alturaDaLinha(caixas, a.insercao);
    const wrapperRect = wrapper.getBoundingClientRect();
    setLinha(y === null ? null : y - wrapperRect.top + wrapper.scrollTop);
  }

  function onHandlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const a = arrasteRef.current;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!a?.ativo || !editor) {
      arrasteRef.current = null;
      return; // clique: o onClick abre o menu
    }
    cancelarArraste();
    const para = destinoDoBloco(a.de, a.insercao);
    if (para !== null) moverBloco(editor.view, a.de, para);
    setHandle(null);
  }

  // Esc cancela o arraste em curso.
  useEffect(() => {
    if (linha === null) return;
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (arrasteRef.current?.ativo) acabouDeArrastarRef.current = true;
      arrasteRef.current = null;
      setLinha(null);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [linha]);

  return (
    <div
      ref={wrapperRef}
      // O aviso de "saiu do bloco" fica aqui (no wrapper todo), não no dom do
      // ProseMirror: o puxador é irmão do EditorContent, sobreposto por cima
      // dele (position: absolute). Enquanto o mouse cruza do texto pro
      // puxador, o navegador escolhe o puxador como alvo do hover — o que
      // dispararia mouseleave no editor e escondia o puxador bem no momento
      // de tentar arrastá-lo. Detectando a saída no wrapper (que contém os
      // dois), mover entre eles não conta como sair.
      onMouseLeave={() => {
        if (!arrasteRef.current) setHandle(null);
      }}
      className={`${
        bare
          ? "relative"
          : "relative border border-border-strong rounded-md bg-input-bg overflow-hidden focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
      }${linha !== null ? " select-none cursor-grabbing" : ""}`}
    >
      {!bare && (
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          {editor && <FormatButtons editor={editor} />}
        </div>
      )}

      {/* Modo documento: a barra só existe enquanto há texto selecionado, e
          flutua ancorada na seleção (Floating UI, via BubbleMenu do Tiptap) —
          mesmo idioma dos popovers de filtro. Uma barra fixa no topo obrigaria
          uma moldura em volta do texto, que é justamente o que este modo tira. */}
      {bare && editor && editable && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-1 rounded-md border border-border-strong bg-surface-elevated shadow-lg px-1 py-1"
        >
          <FormatButtons editor={editor} />
        </BubbleMenu>
      )}

      <EditorContent editor={editor} />
      {/* Onde o bloco vai cair, durante o arraste. */}
      {linha !== null && <div aria-hidden className="pointer-events-none absolute left-0 right-0 z-10 h-0.5 rounded-full bg-brand" style={{ top: linha - 1 }} />}
      {blockDragHandle && handle && (
        <button
          type="button"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={cancelarArraste}
          // Clicar (sem arrastar) abre "Mover para cima/baixo" (03/11/2026); pelo teclado também.
          onClick={() => {
            if (acabouDeArrastarRef.current) {
              acabouDeArrastarRef.current = false;
              return;
            }
            setMenuDoBloco((m) => (m === handle.index ? null : handle.index));
          }}
          aria-expanded={menuDoBloco === handle.index}
          // Sem rolar a página no toque: o dedo arrasta o bloco.
          style={{ top: handle.top + 2, touchAction: "none" }}
          className={`absolute w-6 h-6 flex items-center justify-center rounded-sm text-fg-muted hover:text-fg hover:bg-surface-hover cursor-grab active:cursor-grabbing ${bare ? "-left-8" : "left-1.5"}`}
          title="Arraste para reordenar, ou clique para mover (Alt+↑/↓)"
          aria-label="Mover bloco"
        >
          <GripVertical size={14} />
        </button>
      )}
      {blockDragHandle && handle && editor && menuDoBloco === handle.index && (
        <div
          role="menu"
          aria-label="Mover bloco"
          style={{ top: handle.top + 28 }}
          className={`absolute z-10 flex flex-col rounded-md border border-border-strong bg-surface-elevated p-1 shadow-lg ${bare ? "-left-8" : "left-1.5"}`}
        >
          {[
            { rotulo: "Mover para cima", icone: <ArrowUp size={13} aria-hidden />, para: handle.index - 1 },
            { rotulo: "Mover para baixo", icone: <ArrowDown size={13} aria-hidden />, para: handle.index + 1 },
          ].map((o) => (
            <button
              key={o.rotulo}
              type="button"
              role="menuitem"
              disabled={o.para < 0 || o.para >= editor.state.doc.childCount}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                moverBloco(editor.view, handle.index, o.para);
                setMenuDoBloco(null);
                setHandle(null);
              }}
              className="flex items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1.5 text-left text-fs-2 text-fg-secondary hover:bg-surface-hover hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"
            >
              {o.icone}
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
      {name && <input type="hidden" name={name} value={html} readOnly />}
    </div>
  );
}
