"use client";

import { useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { MessageSquareHeart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Textarea } from "@/components/ui/Textarea";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { classeDoItem } from "@/components/shell/NavLink";
import { NOTAS_DA_SUGESTAO } from "@/lib/solicitacoes/sugestao";
import { enviarSugestaoDoPortal } from "@/app/(portal)/portal/(area)/solicitacoes/actions";

/**
 * "Sugestão ou problema" no rodapé do menu do portal (21/10/2026): a nota de
 * 1 a 5, o que aconteceu e, sem o cliente precisar dizer, a tela de onde ele
 * veio. Vira uma solicitação para o Tech — ver `lib/solicitacoes/sugestao.ts`.
 */
export function SugestaoDoPortal() {
  const pathname = usePathname();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [nota, setNota] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  // A tela em que o botão foi clicado — não a de depois, se a pessoa navegar com a janela aberta.
  const [tela, setTela] = useState(pathname);

  function abrir() {
    setTela(pathname);
    setErro(null);
    setAberto(true);
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData();
    dados.set("nota", nota ? String(nota) : "");
    dados.set("texto", texto);
    dados.set("tela", tela);
    startTransition(async () => {
      const r = await enviarSugestaoDoPortal(dados);
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      setAberto(false);
      setNota(null);
      setTexto("");
      toast.success(`Obrigado! Sua mensagem virou a solicitação nº ${r.numero}, e a equipe responde por lá.`);
    });
  }

  return (
    <>
      <button type="button" onClick={abrir} className={classeDoItem(false, "w-[calc(100%+0.75rem)] text-fs-4 font-medium")}>
        <MessageSquareHeart size={16} className="flex-shrink-0" />
        Sugestão ou problema
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Sugestão ou problema no portal">
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <p className="text-fs-2 text-fg-secondary">
            Conte o que achou do portal, ou o que não funcionou. A equipe recebe junto a tela em que você estava.
          </p>
          <fieldset>
            <legend className="text-label font-medium text-fg mb-2">Como está o portal para você?</legend>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Nota do portal">
              {NOTAS_DA_SUGESTAO.map((n) => (
                <button
                  key={n.valor}
                  type="button"
                  role="radio"
                  aria-checked={nota === n.valor}
                  onClick={() => setNota(nota === n.valor ? null : n.valor)}
                  className={`flex min-w-[3.25rem] flex-col items-center gap-0.5 rounded-md border px-2.5 py-1.5 text-fs-2 transition-colors ${
                    nota === n.valor ? "border-brand bg-brand-subtle text-brand" : "border-border text-fg-secondary hover:bg-surface-hover"
                  }`}
                >
                  <span className="text-fs-4 font-semibold tabular-nums">{n.valor}</span>
                  <span className="text-micro">{n.rotulo}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <CampoForm label="O que aconteceu, ou o que você sugere" htmlFor="sugestao-texto">
            <Textarea id="sugestao-texto" rows={5} maxLength={4000} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </CampoForm>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || (!nota && !texto.trim())}>
              {enviando ? "Enviando…" : "Enviar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
