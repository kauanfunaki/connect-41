"use client";

import { useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2, GripVertical } from "lucide-react";
import type { EditorView } from "@tiptap/pm/view";

type Props = {
  name: string;
  defaultValue?: string;
  // Ativa o puxador de arrastar bloco (estilo Notion) — reordena os nós de
  // nível 1 do documento (parágrafos, títulos, listas...) por drag-n-drop.
  // Opt-in: os outros usos deste editor (descrição de tarefa, documento pro
  // cliente) continuam sem isso, só o Manual BPO pediu.
  blockDragHandle?: boolean;
};

// Precisa ser uma referência estável (fora do componente) — se recriado a cada
// render, o useEditor do Tiptap enxerga "extensions mudou" e destrói/recria o
// editor infinitamente (nunca chega a montar o ProseMirror no DOM de verdade).
const EXTENSIONS = [StarterKit];

function ToolbarButton({
  onClick,
  active,
  children,
}: {
  onClick: () => void;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // preventDefault no mousedown evita que o clique na toolbar tire o foco
      // do editor antes do comando (bold/heading/etc.) rodar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
        active ? "bg-brand/15 text-brand" : "text-fg-muted hover:bg-surface-hover hover:text-fg"
      }`}
    >
      {children}
    </button>
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
export function RichTextEditor({ name, defaultValue = "", blockDragHandle = false }: Props) {
  const [html, setHtml] = useState(defaultValue);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Ref (não state) porque é lido dentro de callbacks do ProseMirror, que não
  // re-renderizam o componente React — precisa do valor mais recente na hora.
  const draggingIndexRef = useRef<number | null>(null);
  const [handle, setHandle] = useState<{ top: number; index: number } | null>(null);

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: `min-h-[160px] ${blockDragHandle ? "pl-9" : "px-3"} py-2 text-[14px] text-fg outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:mt-2 [&_p]:my-1`,
      },
      ...(blockDragHandle
        ? {
            handleDOMEvents: {
              mousemove: (view: EditorView, event: Event) => {
                if (draggingIndexRef.current !== null) return false;
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
              mouseleave: () => {
                if (draggingIndexRef.current === null) setHandle(null);
                return false;
              },
              dragover: (_view: EditorView, event: Event) => {
                if (draggingIndexRef.current !== null) event.preventDefault();
                return false;
              },
              drop: (view: EditorView, event: Event) => {
                if (draggingIndexRef.current === null) return false;
                const e = event as DragEvent;
                e.preventDefault();
                const fromIndex = draggingIndexRef.current;
                draggingIndexRef.current = null;

                const hovered = hoveredBlock(view, e.clientX, e.clientY);
                if (!hovered) return true;
                const rect = hovered.dom.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                const targetIndex = hovered.index + (after ? 1 : 0);
                if (targetIndex === fromIndex || targetIndex === fromIndex + 1) return true;

                const doc = view.state.doc;
                const fromPos = posForIndex(doc, fromIndex);
                const draggedNode = doc.child(fromIndex);
                const tr = view.state.tr.delete(fromPos, fromPos + draggedNode.nodeSize);
                const insertIndex = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
                const insertPos = posForIndex(tr.doc, insertIndex);
                tr.insert(insertPos, draggedNode.type.create(draggedNode.attrs, draggedNode.content, draggedNode.marks));
                view.dispatch(tr.scrollIntoView());
                return true;
              },
            },
          }
        : {}),
    }),
    [blockDragHandle]
  );

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: defaultValue,
    immediatelyRender: false,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    editorProps,
  });

  function onHandleDragStart(e: React.DragEvent) {
    if (handle == null) return;
    draggingIndexRef.current = handle.index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "block");
  }

  function onHandleDragEnd() {
    draggingIndexRef.current = null;
    setHandle(null);
  }

  return (
    <div
      ref={wrapperRef}
      className="relative border border-border-strong rounded-md bg-input-bg overflow-hidden focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
    >
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        {editor && (
          <>
            <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
              <Italic size={14} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              active={editor.isActive("heading", { level: 2 })}
            >
              <Heading2 size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
              <List size={14} />
            </ToolbarButton>
            <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
              <ListOrdered size={14} />
            </ToolbarButton>
          </>
        )}
      </div>
      <EditorContent editor={editor} />
      {blockDragHandle && handle && (
        <button
          type="button"
          draggable
          onDragStart={onHandleDragStart}
          onDragEnd={onHandleDragEnd}
          onMouseDown={(e) => e.preventDefault()}
          style={{ top: handle.top + 2 }}
          className="absolute left-1.5 w-6 h-6 flex items-center justify-center rounded text-fg-muted hover:text-fg hover:bg-surface-hover cursor-grab active:cursor-grabbing"
          title="Arrastar para reordenar"
          aria-label="Arrastar bloco para reordenar"
        >
          <GripVertical size={14} />
        </button>
      )}
      <input type="hidden" name={name} value={html} readOnly />
    </div>
  );
}
