import { Fragment } from "react";

// Renderizador mínimo pra texto com marcação Markdown leve colado em campos de
// texto simples (ex.: publicDescription da vaga, que é um <Textarea>, não um
// editor rich text) — suporta só o que aparece de verdade nesses rascunhos:
// # /## títulos, listas com * ou -, e **negrito** inline. Sem dependência
// externa e sem dangerouslySetInnerHTML: quebra o texto em blocos e monta JSX
// direto, então não há risco de injeção mesmo com conteúdo arbitrário do usuário.
export function SimpleMarkdown({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: { type: "heading" | "list" | "paragraph"; level?: number; lines: string[] }[] = [];

  let currentList: string[] | null = null;
  let currentParagraph: string[] | null = null;

  function flushList() {
    if (currentList) blocks.push({ type: "list", lines: currentList });
    currentList = null;
  }
  function flushParagraph() {
    if (currentParagraph) blocks.push({ type: "paragraph", lines: currentParagraph });
    currentParagraph = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    const listMatch = /^[*-]\s+(.*)$/.exec(line);

    if (headingMatch) {
      flushList();
      flushParagraph();
      blocks.push({ type: "heading", level: headingMatch[1].length, lines: [headingMatch[2]] });
    } else if (listMatch) {
      flushParagraph();
      currentList = [...(currentList ?? []), listMatch[1]];
    } else if (line.trim() === "") {
      flushList();
      flushParagraph();
    } else {
      flushList();
      currentParagraph = [...(currentParagraph ?? []), line];
    }
  }
  flushList();
  flushParagraph();

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          const sizeClass = block.level === 1 ? "text-[16px] mt-4 mb-2" : block.level === 2 ? "text-[14.5px] mt-3 mb-1.5" : "text-[13.5px] mt-2 mb-1";
          return (
            <p key={i} className={`font-semibold text-fg first:mt-0 ${sizeClass}`}>
              {renderInline(block.lines[0])}
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={i} className="list-disc pl-5 my-2 space-y-1">
              {block.lines.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap my-2 first:mt-0">
            {block.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
    return boldMatch ? <strong key={i}>{boldMatch[1]}</strong> : <Fragment key={i}>{part}</Fragment>;
  });
}
