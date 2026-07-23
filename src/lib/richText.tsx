import { Fragment } from "react";
import { LinkIcon } from "lucide-react";
import type { MentionUser } from "@/components/transferencias/MentionTextarea";

// Realça "@Nome Completo" e converte "[texto](url)" em link clicável — cobre
// menção de usuário e menção de tarefa/anexo inseridos pelo composer de
// comentários. Compartilhado por qualquer lugar que exiba texto de Activity
// (feed de comentários, card do Kanban, timeline de Empresa/Pessoa).
export function renderRichText(text: string, users: MentionUser[] = []): React.ReactNode {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text))) {
    if (match.index > lastIndex) segments.push(renderMentions(text.slice(lastIndex, match.index), users, key++));
    segments.push(
      <a key={key++} href={match[2]} className="text-brand hover:underline inline-flex items-center gap-0.5" target={match[2].startsWith("/") ? undefined : "_blank"} rel="noreferrer">
        <LinkIcon size={11} />{match[1]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push(renderMentions(text.slice(lastIndex), users, key++));
  return segments;
}

// Versão em texto puro (sem <a>) — usada em contextos que já são um link
// inteiro (ex.: card do Kanban), onde um <a> aninhado seria HTML inválido.
export function stripRichText(text: string): string {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function renderMentions(text: string, users: MentionUser[], baseKey: number): React.ReactNode {
  if (!text.includes("@") || users.length === 0) return <Fragment key={baseKey}>{text}</Fragment>;
  const names = [...users].map((u) => u.name).sort((a, b) => b.length - a.length);
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  outer: while (remaining.length > 0) {
    for (const name of names) {
      const token = `@${name}`;
      if (remaining.indexOf(token) === 0) {
        parts.push(<span key={`${baseKey}-${key++}`} className="text-brand font-medium">{token}</span>);
        remaining = remaining.slice(token.length);
        continue outer;
      }
    }
    const nextAt = remaining.indexOf("@", 1);
    const cut = nextAt === -1 ? remaining.length : nextAt;
    parts.push(<Fragment key={`${baseKey}-${key++}`}>{remaining.slice(0, cut)}</Fragment>);
    remaining = remaining.slice(cut);
  }
  return parts;
}
