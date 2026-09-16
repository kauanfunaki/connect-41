import { Paperclip } from "lucide-react";
import { formatInstantDateTime } from "@/lib/format";
import { formatarBytes } from "@/lib/fileSize";
import type { AnexoDaConversa, MensagemDaConversa } from "@/lib/financeiro/pendencias/consultas";

function ListaDeAnexos({ anexos, baseDoDownload }: { anexos: AnexoDaConversa[]; baseDoDownload: string }) {
  if (anexos.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {anexos.map((a) => (
        <li key={a.id}>
          <a
            href={`${baseDoDownload}/${a.id}`}
            className="inline-flex items-center gap-1.5 text-[12px] text-brand hover:underline break-all"
          >
            <Paperclip size={12} className="shrink-0" /> {a.fileName}
            <span className="text-fg-muted">· {formatarBytes(a.sizeBytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * A conversa em ordem de chegada, com os anexos de cada mensagem.
 *
 * Serve as duas telas: `baseDoDownload` aponta para a rota de quem está vendo
 * (interna ou do portal), porque cada rota confere o próprio escopo e um link
 * para a rota errada simplesmente não abriria.
 */
export function ConversaDaPendencia({
  descricao,
  anexosDaAbertura,
  abertaPor,
  abertaEm,
  mensagens,
  baseDoDownload,
  ladoDeQuemVe,
}: {
  descricao: string | null;
  anexosDaAbertura: AnexoDaConversa[];
  abertaPor: string;
  abertaEm: Date;
  mensagens: MensagemDaConversa[];
  baseDoDownload: string;
  ladoDeQuemVe: "EQUIPE" | "CLIENTE";
}) {
  return (
    <ol className="flex flex-col gap-3">
      <li className="rounded-md border border-border bg-surface px-4 py-3">
        <p className="text-[11px] text-fg-muted">
          {abertaPor} · abriu em {formatInstantDateTime(abertaEm)}
        </p>
        {descricao ? (
          <p className="mt-1.5 text-[13px] whitespace-pre-wrap break-words">{descricao}</p>
        ) : (
          <p className="mt-1.5 text-[13px] text-fg-muted">Sem descrição.</p>
        )}
        <ListaDeAnexos anexos={anexosDaAbertura} baseDoDownload={baseDoDownload} />
      </li>
      {mensagens.map((m) => {
        const minha = m.lado === ladoDeQuemVe;
        return (
          <li
            key={m.id}
            className={`rounded-md border px-4 py-3 ${minha ? "border-brand/30 bg-brand/5 ml-6" : "border-border bg-surface mr-6"}`}
          >
            <p className="text-[11px] text-fg-muted">
              {m.autorNome} · {m.lado === "EQUIPE" ? "equipe" : "cliente"} · {formatInstantDateTime(m.criadaEm)}
            </p>
            {m.corpo && <p className="mt-1.5 text-[13px] whitespace-pre-wrap break-words">{m.corpo}</p>}
            <ListaDeAnexos anexos={m.anexos} baseDoDownload={baseDoDownload} />
          </li>
        );
      })}
    </ol>
  );
}
