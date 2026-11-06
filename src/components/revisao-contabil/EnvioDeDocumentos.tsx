"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileDropzone, type ArquivoNaFila } from "@/components/ui/FileDropzone";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { uploadComProgresso } from "@/lib/uploadComProgresso";
import { ACCEPT_DA_REVISAO, MB_POR_ARQUIVO } from "@/lib/revisao-contabil/regras-da-tela";

/**
 * Envio dos documentos do fechamento, um por vez com progresso (o desenho de
 * `arquivos/EnvioDeArquivos`). Cada arquivo é lido pelo motor na chegada; o
 * que ele não lê volta com o motivo na fila, e o arquivo de dentro de um ZIP
 * que ficou de fora aparece no aviso embaixo, sem derrubar os outros.
 */
export function EnvioDeDocumentos({ fechamentoId }: { fechamentoId: string }) {
  const [fila, setFila] = useState<ArquivoNaFila[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const router = useRouter();

  function atualizar(id: string, mudanca: Partial<ArquivoNaFila>) {
    setFila((prev) => prev.map((a) => (a.id === id ? { ...a, ...mudanca } : a)));
  }

  async function enviar() {
    setEnviando(true);
    setAvisos([]);
    const novos: string[] = [];
    let falhas = 0;
    for (const item of fila) {
      if (item.estado === "concluido") continue;
      atualizar(item.id, { estado: "enviando", progresso: 0, erro: undefined });
      const form = new FormData();
      form.set("fechamentoId", fechamentoId);
      form.set("arquivo", item.file);
      const r = await uploadComProgresso("/api/revisao-contabil/documentos", form, (pct) => atualizar(item.id, { progresso: pct }));
      if (r.ok) {
        atualizar(item.id, { estado: "concluido", progresso: 100 });
        const extras = (r.body as { avisos?: unknown } | null)?.avisos;
        if (Array.isArray(extras)) novos.push(...extras.filter((x): x is string => typeof x === "string"));
      } else {
        falhas++;
        atualizar(item.id, { estado: "erro", erro: r.erro });
      }
    }
    setEnviando(false);
    setAvisos(novos);
    if (falhas === 0) setFila([]);
    router.refresh();
  }

  const pendentes = fila.filter((a) => a.estado !== "concluido").length;

  return (
    <div className="flex flex-col gap-3">
      <FileDropzone
        accept={ACCEPT_DA_REVISAO}
        maxSizeMb={MB_POR_ARQUIVO}
        multiple
        arquivos={fila}
        desabilitado={enviando}
        onAdicionar={(files) =>
          setFila((prev) => [...prev, ...files.map((file) => ({ id: crypto.randomUUID(), file, progresso: 0, estado: "pendente" as const }))])
        }
        onRemover={(id) => setFila((prev) => prev.filter((a) => a.id !== id))}
      />
      {avisos.length > 0 && (
        <Aviso tom="atencao">
          <p className="font-medium">Arquivos de dentro do ZIP que o motor não leu:</p>
          <ul className="mt-1 list-disc pl-5">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={enviar} disabled={pendentes === 0} loading={enviando} loadingLabel="Lendo…">
          {pendentes > 1 ? `Enviar ${pendentes} arquivos` : "Enviar"}
        </Button>
      </div>
    </div>
  );
}
