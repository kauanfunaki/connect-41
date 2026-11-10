"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { useConfirm } from "@/components/ui/useConfirm";
import { EnvioDeArquivos } from "@/components/arquivos/EnvioDeArquivos";
import { formatarBytes } from "@/lib/fileSize";
import { removerAnexoTech } from "@/app/(app)/controle-interno/actions";

export type AnexoDoItem = { id: string; fileName: string; mimeType: string; sizeBytes: number; uploadedByName: string; createdAt: string };

const URL_DOS_ANEXOS = "/api/tech-interno/anexos";
const abrir = (id: string) => `${URL_DOS_ANEXOS}/${id}?ver=1`;
const baixar = (id: string) => `${URL_DOS_ANEXOS}/${id}`;

/**
 * Os anexos do item (05/11/2026): imagens em miniatura, que abrem em outra aba,
 * e os demais arquivos numa lista para baixar. Quem pode agir no módulo anexa e
 * remove; quem só vê, abre e baixa.
 */
export function AnexosDoItem({ itemId, anexos, podeEditar }: { itemId: string; anexos: AnexoDoItem[]; podeEditar: boolean }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const { dialog, requestConfirm } = useConfirm();
  const imagens = anexos.filter(a => a.mimeType.startsWith("image/"));
  const outros = anexos.filter(a => !a.mimeType.startsWith("image/"));
  const remover = (a: AnexoDoItem) => requestConfirm(
    { title: `Remover ${a.fileName}?`, description: "O arquivo sai do item e não pode ser recuperado.", destructive: true, confirmLabel: "Remover" },
    async () => { const r = await removerAnexoTech(a.id); if (r) return r; router.refresh(); },
  );

  return <section aria-labelledby="tech-anexos" className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="tech-anexos" className="text-card-title font-semibold text-fg">Anexos{anexos.length ? ` (${anexos.length})` : ""}</h2>
      {podeEditar && !enviando && <Button variant="secondary" size="sm" onClick={() => setEnviando(true)}><Paperclip size={14} aria-hidden />Anexar arquivos</Button>}
    </div>
    {enviando && <EnvioDeArquivos url={URL_DOS_ANEXOS} campos={{ itemId }} onCancelar={() => setEnviando(false)}
      onTerminou={ids => { if (ids.length) router.refresh(); }} dica="Imagens, PDF, Word, Excel, ZIP ou texto, até 10 MB cada." />}
    {!anexos.length && !enviando && <p className="text-helper text-fg-muted">Nenhum anexo. Prints de tela e PDFs ajudam a entender o item.</p>}
    {imagens.length > 0 && <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="Imagens">
      {imagens.map(a => <li key={a.id} className="group relative min-w-0 overflow-hidden rounded-md border border-border bg-surface-2">
        <a href={abrir(a.id)} target="_blank" rel="noopener noreferrer" className="block aspect-video" title={a.fileName}>
          {/* eslint-disable-next-line @next/next/no-img-element -- rota autenticada; o otimizador do Next não leva o cookie */}
          <img src={abrir(a.id)} alt={a.fileName} loading="lazy" className="size-full object-cover" />
        </a>
        <div className="flex items-center gap-1 px-2 py-1">
          <span className="min-w-0 flex-1 truncate text-helper text-fg-secondary" title={a.fileName}>{a.fileName}</span>
          {podeEditar && <IconButton size="sm" title={`Remover ${a.fileName}`} onClick={() => remover(a)}><Trash2 size={14} /></IconButton>}
        </div>
      </li>)}
    </ul>}
    {outros.length > 0 && <ul className="flex flex-col gap-2" aria-label="Arquivos">
      {outros.map(a => <li key={a.id} className="flex min-w-0 items-center gap-3 rounded-md border border-border px-3 py-2">
        <FileText size={16} aria-hidden className="shrink-0 text-fg-muted" />
        <div className="min-w-0 flex-1">
          {a.mimeType === "application/pdf"
            ? <a href={abrir(a.id)} target="_blank" rel="noopener noreferrer" className="block truncate text-ui font-medium text-brand hover:underline" title={a.fileName}>{a.fileName}</a>
            : <span className="block truncate text-ui font-medium text-fg" title={a.fileName}>{a.fileName}</span>}
          <span className="text-helper text-fg-muted">{formatarBytes(a.sizeBytes)} · {a.uploadedByName}</span>
        </div>
        <IconButton size="sm" nativo href={baixar(a.id)} title={`Baixar ${a.fileName}`}><Download size={14} /></IconButton>
        {podeEditar && <IconButton size="sm" title={`Remover ${a.fileName}`} onClick={() => remover(a)}><Trash2 size={14} /></IconButton>}
      </li>)}
    </ul>}
    {dialog}
  </section>;
}
