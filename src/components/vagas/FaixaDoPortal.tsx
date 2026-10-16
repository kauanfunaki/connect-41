"use client";

import { Copy, ExternalLink, Globe, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { SituacaoNoPortal } from "@/lib/recrutamento/fichaDaVaga";

/** Copiar com o recurso do navegador que recusa a área de transferência (o mesmo do chat da Ceci). */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

type Props = {
  situacao: SituacaoNoPortal;
  /** O endereço da vaga no portal (o do 41 Carreiras, nas vagas da 41). Pode ser só o caminho, sem APP_PUBLIC_URL. */
  url: string | null;
  /** O endereço para ler, sem "https://" e com o id cortado. */
  urlCurta: string | null;
  /** O link do WhatsApp com a mensagem e o endereço. */
  whatsapp: string | null;
  /** Quem gerencia a vaga: só ele lê "use Editar para publicar". */
  podeEditar: boolean;
};

/**
 * A vaga no portal de vagas — escolha "Vaga · 2 B" do Kauan (14/10/2026). O
 * endereço aparecia cru, em azul, quebrando linha no pé do cartão Detalhes,
 * sem botão de copiar nem de mandar.
 *
 * Publicada: uma faixa azul-clara logo abaixo do título, com as três coisas
 * que se faz com o link — abrir, copiar e mandar pelo WhatsApp. Fora do
 * portal: uma linha discreta dizendo por quê e como publicar.
 */
export function FaixaDoPortal({ situacao, url, urlCurta, whatsapp, podeEditar }: Props) {
  const toast = useToast();

  if (!situacao.publicada || !url) {
    const porque =
      !situacao.publicada && situacao.motivo === "fora_do_ar"
        ? "Ela está marcada para o portal, mas só aparece lá enquanto estiver Aberta."
        : !situacao.publicada && situacao.motivo === "prazo_vencido"
          ? `As inscrições terminaram em ${situacao.prazo}${podeEditar ? "; para reabrir, mude o “Inscrições até” em Editar" : ""}.`
          : podeEditar
            ? "Para divulgar, clique em Editar e marque “Publicar no portal de vagas”."
            : "Quem gerencia a vaga pode publicá-la.";
    return (
      <p className="mb-4 flex items-start gap-2 text-fs-2 text-fg-muted">
        <Globe size={14} aria-hidden className="mt-0.5 flex-shrink-0" />
        <span>
          <span className="font-medium text-fg-secondary">Não publicada no portal de vagas.</span> {porque}
        </span>
      </p>
    );
  }

  async function copiar() {
    // Só o caminho, sem APP_PUBLIC_URL (ambiente local): o endereço inteiro sai da janela.
    const inteiro = /^https?:\/\//i.test(url!) ? url! : new URL(url!, window.location.origin).href;
    if (await copiarTexto(inteiro)) toast.success("Link da vaga copiado.");
    else toast.error("Não deu para copiar. Abra a página da vaga e copie o endereço.");
  }

  return (
    <section
      aria-label="Vaga no portal de vagas"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-brand/20 bg-brand-subtle px-4 py-3.5 sm:px-5"
    >
      <span aria-hidden className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-surface text-brand">
        <Globe size={18} />
      </span>
      <div className="min-w-0 flex-1 basis-[16rem]">
        <p className="text-label font-semibold text-fg">Publicada no portal de vagas</p>
        <p className="text-fs-2 text-fg-secondary">
          Quem tiver o link pode se candidatar
          {urlCurta && (
            <>
              {" · "}
              <span className="break-all text-fg-muted" title={url}>
                {urlCurta}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button href={url} nativo target="_blank" rel="noopener noreferrer" size="sm">
          <ExternalLink size={14} /> Abrir página da vaga
        </Button>
        <Button variant="secondary" size="sm" onClick={copiar} className="bg-surface">
          <Copy size={14} /> Copiar link
        </Button>
        {whatsapp && (
          <Button href={whatsapp} nativo target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" className="bg-surface">
            <MessageCircle size={14} /> WhatsApp
          </Button>
        )}
      </div>
    </section>
  );
}
