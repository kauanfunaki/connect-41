"use client";

import { useState, useTransition } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoDeAnexos } from "@/components/pendencias/CampoDeAnexos";
import { formatInstantDateTime } from "@/lib/format";
import { formatarBytes } from "@/lib/fileSize";
import type { DocumentoDoProcesso } from "@/lib/societario/conversa";

type RespostaDaAcao = { error: string } | { ok: true; aviso?: string | null };

/**
 * Os documentos do processo — os guardados aqui e os que vieram anexados na
 * conversa — e o formulário de guardar mais. Serve a equipe e o portal: muda a
 * action e a rota de download, que cada lado confere com o próprio escopo.
 */
export function DocumentosDoProcesso({
  processId,
  documentos,
  baseDoDownload,
  acao,
  ladoDeQuemVe,
  dica,
}: {
  processId: string;
  documentos: DocumentoDoProcesso[];
  baseDoDownload: string;
  acao: (formData: FormData) => Promise<RespostaDaAcao>;
  ladoDeQuemVe: "EQUIPE" | "CLIENTE";
  dica?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [versao, setVersao] = useState(0);
  const [pendente, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      {documentos.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nenhum documento neste processo ainda.</p>
      ) : (
        <ul className="flex flex-col">
          {documentos.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 py-2 border-b border-border-soft last:border-0">
              <FileText size={15} className="mt-0.5 shrink-0 text-fg-muted" aria-hidden />
              <div className="flex-1 min-w-[12rem] flex flex-col gap-0.5">
                <a href={`${baseDoDownload}/${d.id}`} className="text-[13px] text-brand hover:underline break-all">
                  {d.fileName}
                </a>
                {d.descricao && <span className="text-[12px] text-fg break-words">{d.descricao}</span>}
                <span className="text-[11px] text-fg-muted">
                  {d.lado === ladoDeQuemVe ? d.enviadoPor : `${d.enviadoPor} · ${d.lado === "EQUIPE" ? "equipe" : "cliente"}`} ·{" "}
                  {formatInstantDateTime(d.enviadoEm)} · {formatarBytes(d.sizeBytes)}
                  {d.naConversa && " · na conversa"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {aviso && <p className="text-[12px] text-warning">{aviso}</p>}

      {aberto ? (
        <form
          key={versao}
          className="flex flex-col gap-3 rounded-md border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const dados = new FormData(e.currentTarget);
            setErro(null);
            setAviso(null);
            startTransition(async () => {
              const r = await acao(dados);
              if ("error" in r) {
                setErro(r.error);
                return;
              }
              setVersao((v) => v + 1);
              setAberto(false);
              if (r.aviso) setAviso(r.aviso);
            });
          }}
        >
          <input type="hidden" name="processId" value={processId} />
          <CampoForm label="Descrição (opcional)" htmlFor={`doc-desc-${processId}`} helper={dica}>
            <Input id={`doc-desc-${processId}`} name="descricao" maxLength={200} placeholder="Ex.: Contrato social registrado" />
          </CampoForm>
          <CampoDeAnexos idBase={`doc-${processId}`} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pendente}>
              <Upload size={13} /> {pendente ? "Enviando…" : "Guardar documentos"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            {erro && <span className="text-[12px] text-danger">{erro}</span>}
          </div>
        </form>
      ) : (
        <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => setAberto(true)}>
          <Upload size={13} /> Adicionar documentos
        </Button>
      )}
    </div>
  );
}
