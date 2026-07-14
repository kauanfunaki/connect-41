"use client";

import { useMemo, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, List, ListOrdered, Heading2 } from "lucide-react";

type Props = {
  name: string;
  defaultValue?: string;
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

// Editor rich text (Tiptap) com um <input type="hidden"> sincronizado — assim
// funciona dentro de um <form action={...}> comum (useActionState), sem
// precisar de submit via JS. O HTML gerado é sanitizado de novo no servidor
// (src/lib/clientDocuments.ts) antes de ser persistido.
export function RichTextEditor({ name, defaultValue = "" }: Props) {
  const [html, setHtml] = useState(defaultValue);

  const editorProps = useMemo(
    () => ({
      attributes: {
        class:
          "min-h-[160px] px-3 py-2 text-[14px] text-fg outline-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h2]:mt-2 [&_p]:my-1",
      },
    }),
    []
  );

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: defaultValue,
    immediatelyRender: false,
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
    editorProps,
  });

  return (
    <div className="border border-border-strong rounded-[10px] bg-input-bg overflow-hidden focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]">
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
      <input type="hidden" name={name} value={html} readOnly />
    </div>
  );
}
