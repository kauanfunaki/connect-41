"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileImage, FileText, Network, Paperclip, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Aviso } from "@/components/ui/Aviso";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { formatInstantDate } from "@/lib/format";
import { ACCEPT_DOS_ANEXOS, TAMANHO_MAXIMO_DO_ANEXO, tamanhoLegivel } from "@/lib/fluxos/arquivos";
import type { AnexoDoFluxo } from "@/lib/fluxos/tipos";

type Props = {
  fluxoId: string;
  anexos: AnexoDoFluxo[];
  podeAnexar: boolean;
  podeExcluir: boolean;
  excluirAction: (anexoId: string) => Promise<{ error: string } | null>;
};

const icone = (a: AnexoDoFluxo) =>
  a.mime === "application/pdf" ? <FileText size={16} aria-hidden /> : a.mime.startsWith("image/") ? <FileImage size={16} aria-hidden /> : <Network size={16} aria-hidden />;

/**
 * Os arquivos do fluxo (10/11/2026, pedido do Kauan): o PDF exportado de outra
 * ferramenta, a imagem do desenho antigo, o .drawio. Imagem e PDF abrem numa
 * aba (a prévia); todos baixam. Anexar é de quem edita os fluxos do setor;
 * excluir, só do Administrador.
 */
export function ArquivosDoFluxo({ fluxoId, anexos, podeAnexar, podeExcluir, excluirAction }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function anexar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setErro(null);
    // O teto também é conferido no servidor; aqui só poupa o envio de 30 MB à toa.
    if (arquivo.size > TAMANHO_MAXIMO_DO_ANEXO) {
      setErro("O arquivo passa de 10 MB.");
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append("fluxo", fluxoId);
      form.append("arquivo", arquivo);
      const res = await fetch("/api/fluxos/anexos", { method: "POST", body: form });
      const corpo = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErro(corpo.error ?? "Erro ao anexar o arquivo.");
      else {
        toast.success(`“${arquivo.name}” anexado.`);
        router.refresh();
      }
    } catch {
      setErro("Erro ao anexar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {anexos.length === 0 ? (
        <p className="text-fs-2 text-fg-muted">
          {podeAnexar ? "Nenhum arquivo ainda. Anexe o PDF exportado de outra ferramenta, uma imagem do desenho antigo ou o .drawio." : "Nenhum arquivo anexado."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-soft rounded-lg border border-border">
          {anexos.map((a) => {
            const endereco = `/api/fluxos/anexos/${a.id}`;
            return (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                <span className="text-fg-muted">{icone(a)}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  {a.previa ? (
                    <a href={endereco} target="_blank" rel="noopener" className="truncate text-ui font-medium text-fg hover:text-brand hover:underline">
                      {a.nome}
                    </a>
                  ) : (
                    <span className="truncate text-ui font-medium text-fg">{a.nome}</span>
                  )}
                  <span className="text-fs-2 text-fg-muted">
                    {tamanhoLegivel(a.tamanho)} · {formatInstantDate(new Date(a.enviadoEm))}
                    {a.enviadoPor ? ` · ${a.enviadoPor}` : ""}
                  </span>
                </div>
                <IconButton href={`${endereco}?baixar=1`} nativo download title={`Baixar ${a.nome}`} className="max-md:size-11">
                  <Download size={15} />
                </IconButton>
                {podeExcluir && (
                  <IconButton
                    title={`Excluir ${a.nome}`}
                    className="hover:text-danger! hover:bg-danger/8! max-md:size-11"
                    onClick={() =>
                      requestConfirm({ title: `Excluir “${a.nome}”?`, description: "O arquivo sai do fluxo e do servidor. Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" }, async () => {
                        const r = await excluirAction(a.id);
                        if (r) return r;
                        router.refresh();
                        return null;
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {erro && <Aviso>{erro}</Aviso>}

      {podeAnexar && (
        <>
          <input ref={campo} type="file" accept={ACCEPT_DOS_ANEXOS} className="hidden" onChange={anexar} aria-hidden tabIndex={-1} />
          <Button variant="ghost" size="sm" className="self-start max-md:h-11" onClick={() => campo.current?.click()} loading={enviando} loadingLabel="Anexando…">
            <Paperclip size={14} /> Anexar arquivo
          </Button>
          <p className="-mt-2 text-fs-2 text-fg-muted">PDF, imagem (PNG, JPG, WEBP) ou .drawio, até 10 MB.</p>
        </>
      )}
      {dialog}
    </div>
  );
}
