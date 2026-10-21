"use client";

import { useState, useTransition } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatarBytes } from "@/lib/fileSize";
import { formatInstantDate } from "@/lib/format";
import { ACCEPT_DOS_ANEXOS } from "@/lib/financeiro/pendencias/anexo";
import { anexarAoLancamento, removerAnexoDoLancamento } from "@/lib/financeiro/anexosServidor";
import type { AnexoDaConta } from "@/lib/financeiro/anexos";

/** O nome do campo de arquivo — quem está em volta (a janela Editar) tira ele do próprio envio. */
export const CAMPO_DO_ANEXO_DA_CONTA = "anexoDaConta";

const dataBr = (iso: string) => formatInstantDate(new Date(iso));

/**
 * Os anexos de uma conta que já existe (lote H2, 19/10) — a seção "Anexos" da
 * janela Editar. O arquivo sobe assim que é escolhido: anexo não depende do
 * "Salvar", e nem tem trava, porque não mexe no dinheiro.
 */
export function AnexosDaConta({ entryId, iniciais }: { entryId: string; iniciais: AnexoDaConta[] }) {
  const [anexos, setAnexos] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const [escolha, setEscolha] = useState(0);
  const { dialog, requestConfirm } = useConfirm();

  function anexar(arquivo: File | null) {
    if (!arquivo) return;
    setErro(null);
    const dados = new FormData();
    dados.set("entryId", entryId);
    dados.set("anexos", arquivo);
    startTransition(async () => {
      const r = await anexarAoLancamento(dados);
      if ("error" in r) setErro(r.error);
      else setAnexos(r.anexos);
      setEscolha((v) => v + 1);
    });
  }

  function tirar(anexo: AnexoDaConta) {
    requestConfirm(
      { title: `Tirar "${anexo.nome}" desta conta?`, description: "O arquivo é apagado. Para guardar de novo, anexe outra vez.", confirmLabel: "Tirar", destructive: true },
      async () => {
        const r = await removerAnexoDoLancamento(anexo.id);
        if ("error" in r) throw new Error(r.error);
        setAnexos(r.anexos);
      }
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ui font-medium text-fg">Anexos</p>
      {anexos.length === 0 ? (
        <p className="text-helper text-fg-muted">Nenhum anexo. Guarde aqui o boleto, a nota ou o comprovante.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-ui">
              <Paperclip size={14} className="flex-shrink-0 text-fg-muted" />
              <a href={`/api/financeiro/anexos/${a.id}`} className="min-w-0 flex-1 truncate text-brand hover:underline">
                {a.nome}
              </a>
              <span className="flex-shrink-0 text-helper text-fg-muted tabular-nums">
                {formatarBytes(a.tamanho)} · {dataBr(a.enviadoEm)}
                {a.enviadoPor ? ` · ${a.enviadoPor}` : ""}
              </span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Tirar ${a.nome}`} onClick={() => tirar(a)}>
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <FileDropzoneField key={escolha} name={CAMPO_DO_ANEXO_DA_CONTA} accept={ACCEPT_DOS_ANEXOS} maxSizeMb={10} compacto onFileChange={anexar} />
      {enviando && <p className="text-helper text-fg-muted">Anexando…</p>}
      {erro && <p className="text-helper text-danger">{erro}</p>}
      {dialog}
    </div>
  );
}
