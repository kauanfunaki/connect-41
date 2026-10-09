"use client";

import { useState } from "react";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import { Button } from "@/components/ui/Button";
import { uploadComProgresso } from "@/lib/uploadComProgresso";
import { ACCEPT_DO_DRIVE } from "@/lib/drive/tipoDoArquivo";

type Props = {
  /** Rota que recebe um arquivo por vez. */
  url: string;
  /** Campos que vão junto de cada arquivo (a pasta, a empresa). */
  campos: Record<string, string>;
  /** Chamado quando a fila termina, com os ids do que entrou. */
  onTerminou: (ids: string[]) => void;
  onCancelar?: () => void;
  /** Frase de apoio acima da área ("Vai para Enviados pelo cliente."). */
  dica?: string;
};

/**
 * Envio de vários arquivos para os Arquivos, um por vez com progresso — o
 * mesmo desenho do DocumentsSection: em paralelo as barras andariam juntas sem
 * dizer qual arquivo está onde. Com falha, a fila fica mostrando qual deu erro,
 * e enviar de novo pula os que já entraram.
 */
export function EnvioDeArquivos({ url, campos, onTerminou, onCancelar, dica }: Props) {
  const [fila, setFila] = useState<ArquivoNaFila[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function atualizar(id: string, mudanca: Partial<ArquivoNaFila>) {
    setFila((prev) => prev.map((a) => (a.id === id ? { ...a, ...mudanca } : a)));
  }

  async function enviar() {
    if (fila.length === 0) return;
    setErro(null);
    setEnviando(true);
    const ids: string[] = [];
    let falhas = 0;
    for (const item of fila) {
      if (item.estado === "concluido") continue;
      atualizar(item.id, { estado: "enviando", progresso: 0, erro: undefined });
      const form = new FormData();
      for (const [k, v] of Object.entries(campos)) form.set(k, v);
      form.set("arquivo", item.file);
      const r = await uploadComProgresso(url, form, (pct) => atualizar(item.id, { progresso: pct }));
      if (r.ok) {
        atualizar(item.id, { estado: "concluido", progresso: 100 });
        const id = (r.body as { id?: unknown } | null)?.id;
        if (typeof id === "string") ids.push(id);
      } else {
        falhas++;
        atualizar(item.id, { estado: "erro", erro: r.erro });
      }
    }
    setEnviando(false);
    if (falhas === 0) setFila([]);
    else setErro(falhas === 1 ? "Um arquivo não foi enviado: veja o erro na lista." : `${falhas} arquivos não foram enviados: veja os erros na lista.`);
    onTerminou(ids);
  }

  const pendentes = fila.filter((a) => a.estado !== "concluido").length;

  return (
    <div className="flex flex-col gap-3">
      {dica && <p className="text-fs-3 text-fg-secondary">{dica}</p>}
      <FileDropzone
        accept={ACCEPT_DO_DRIVE}
        maxSizeMb={10}
        multiple
        arquivos={fila}
        desabilitado={enviando}
        onAdicionar={(files) =>
          setFila((prev) => [
            ...prev,
            ...files.map((file) => ({ id: crypto.randomUUID(), file, progresso: 0, estado: "pendente" as const })),
          ])
        }
        onRemover={(id) => setFila((prev) => prev.filter((a) => a.id !== id))}
      />
      {erro && <p className="text-fs-3 text-danger" role="alert">{erro}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancelar && (
          <Button type="button" variant="secondary" size="sm" onClick={onCancelar} disabled={enviando}>
            Fechar
          </Button>
        )}
        <Button type="button" size="sm" onClick={enviar} disabled={pendentes === 0} loading={enviando} loadingLabel="Enviando…">
          {pendentes > 1 ? `Enviar ${pendentes} arquivos` : "Enviar"}
        </Button>
      </div>
    </div>
  );
}
