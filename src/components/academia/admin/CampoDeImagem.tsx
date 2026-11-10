"use client";

import { useId, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ACCEPT_DAS_IMAGENS, TAMANHO_MAXIMO_DA_IMAGEM } from "@/lib/academia/imagens";

/**
 * Uma imagem da questão de lógica (10/11/2026): envia na hora pela rota da
 * Academia e guarda o endereço devolvido no rascunho. "Tirar" só solta a
 * imagem do rascunho — o arquivo fica (outra questão pode ter a mesma cópia
 * aberta na tela, e não há como saber sem varrer o cadastro).
 */
export function CampoDeImagem({ url, onMudar, rotulo }: { url: string | null; onMudar: (url: string | null) => void; rotulo: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const id = useId();

  async function enviar(arquivo: File) {
    setErro("");
    if (arquivo.size > TAMANHO_MAXIMO_DA_IMAGEM) {
      setErro("A imagem passa de 4 MB.");
      return;
    }
    setEnviando(true);
    try {
      const corpo = new FormData();
      corpo.append("imagem", arquivo);
      const resposta = await fetch("/api/academia/imagens", { method: "POST", body: corpo });
      const json = (await resposta.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!resposta.ok || !json.url) setErro(json.error ?? "Não foi possível enviar a imagem.");
      else onMudar(json.url);
    } catch {
      setErro("Não foi possível enviar a imagem. Confira a conexão.");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- imagem privada, servida pela rota da Academia com a sessão
        <img src={url} alt={rotulo} className="max-h-40 w-auto max-w-full self-start rounded-md border border-border object-contain" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={entrada}
          id={id}
          type="file"
          accept={ACCEPT_DAS_IMAGENS}
          className="sr-only"
          aria-label={rotulo}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void enviar(f);
          }}
        />
        <Button type="button" size="sm" variant="secondary" onClick={() => entrada.current?.click()} disabled={enviando} className="min-h-11 sm:min-h-0">
          <ImagePlus size={14} aria-hidden /> {enviando ? "Enviando…" : url ? "Trocar imagem" : "Pôr imagem"}
        </Button>
        {url && (
          <Button type="button" size="sm" variant="ghost" onClick={() => onMudar(null)} className="min-h-11 sm:min-h-0">
            <X size={14} aria-hidden /> Tirar
          </Button>
        )}
        <span className="text-helper text-fg-muted">JPG, PNG ou WEBP, até 4 MB.</span>
      </div>
      {erro && <p className="text-helper text-danger" role="alert">{erro}</p>}
    </div>
  );
}
