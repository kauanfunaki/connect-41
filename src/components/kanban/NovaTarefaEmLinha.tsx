"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";

/** O "+ Nova tarefa" do topo da lista avisa a primeira coluna por este evento. */
export const EVENTO_NOVA_TAREFA = "connect41:quadro-nova-tarefa";

/** Abre a criação em linha na primeira coluna da lista aberta. */
export function pedirNovaTarefa() {
  window.dispatchEvent(new CustomEvent(EVENTO_NOVA_TAREFA));
}

/**
 * O "+ Nova tarefa" do topo da lista (05/11/2026): sem formulário — abre o
 * campo em linha na primeira coluna (na visão Lista ou no Kanban). Era um link
 * para o formulário em janela.
 */
export function BotaoNovaTarefa() {
  return (
    <Button type="button" variant="primary" onClick={pedirNovaTarefa}>
      <Plus size={14} /> Nova tarefa
    </Button>
  );
}

/**
 * Na coluna que atende ao "+ Nova tarefa" do topo (a primeira): conta os
 * pedidos, para passar em `sinalParaAbrir`, e avisa quem precisa se abrir antes
 * (o grupo recolhido).
 */
export function useNovaTarefaDoTopo(ativo: boolean, aoPedir?: () => void): number {
  const [sinal, setSinal] = useState(0);
  const aoPedirRef = useRef(aoPedir);
  useEffect(() => {
    aoPedirRef.current = aoPedir;
  });
  useEffect(() => {
    if (!ativo) return;
    const ouvir = () => {
      aoPedirRef.current?.();
      setSinal((s) => s + 1);
    };
    window.addEventListener(EVENTO_NOVA_TAREFA, ouvir);
    return () => window.removeEventListener(EVENTO_NOVA_TAREFA, ouvir);
  }, [ativo]);
  return sinal;
}

type Props = {
  stageId: string;
  /** Nome da coluna, para o leitor de tela saber onde a tarefa entra. */
  nomeDaColuna: string;
  criar: (stageId: string, title: string) => Promise<void>;
  /** O formulário completo — para a atividade de uma empresa ou pessoa. */
  hrefDoFormulario: string;
  /** Muda para abrir de fora (o "+ Nova tarefa" do topo). */
  sinalParaAbrir?: number;
  rotulo?: string;
  className?: string;
};

/**
 * A tarefa nova em linha (05/11/2026, como o "+ Add Task" do ClickUp): só o
 * nome; Enter grava e o campo fica aberto para a próxima, Esc fecha. Nada mais
 * vem definido — a situação é a da coluna, e datas, responsáveis, prioridade e
 * etiquetas ficam "Vazio" até alguém preencher no detalhe da tarefa.
 *
 * A atividade de uma empresa ou pessoa segue pelo formulário completo, no link
 * ao lado do campo.
 */
export function NovaTarefaEmLinha({
  stageId,
  nomeDaColuna,
  criar,
  hrefDoFormulario,
  sinalParaAbrir = 0,
  rotulo = "Adicionar atividade",
  className = "",
}: Props) {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [pendente, startTransition] = useTransition();
  const caixaRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const toast = useToast();

  const focar = useCallback(() => {
    requestAnimationFrame(() => {
      caixaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      document.getElementById(id)?.focus();
    });
  }, [id]);

  // O pedido de fora abre o campo já no render (sem efeito que muda estado);
  // o foco vem depois, quando o campo existe.
  const [sinalVisto, setSinalVisto] = useState(sinalParaAbrir);
  if (sinalParaAbrir !== sinalVisto) {
    setSinalVisto(sinalParaAbrir);
    setAberto(true);
  }
  useEffect(() => {
    if (sinalParaAbrir > 0) focar();
  }, [sinalParaAbrir, focar]);

  function gravar() {
    const nome = titulo.trim();
    if (!nome || pendente) return;
    startTransition(async () => {
      try {
        await criar(stageId, nome);
        setTitulo("");
      } catch {
        toast.error("Não deu para falar com o servidor. A tarefa não foi criada.");
      }
      focar();
    });
  }

  if (!aberto) {
    return (
      <Button
        variant="ghost"
        size="xs"
        type="button"
        onClick={() => {
          setAberto(true);
          focar();
        }}
        className={`-ml-2.5 ${className}`}
      >
        <Plus size={11} /> {rotulo}
      </Button>
    );
  }

  return (
    <div
      ref={caixaRef}
      className={`flex flex-wrap items-center gap-2 ${className}`}
      onBlur={(e) => {
        // Fecha ao sair da caixa vazia — mas não ao ir para o "Gravar" ou o link.
        if (caixaRef.current?.contains(e.relatedTarget as Node | null)) return;
        if (!titulo.trim() && !pendente) setAberto(false);
      }}
    >
      <Input
        id={id}
        compact
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            gravar();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setTitulo("");
            setAberto(false);
          }
        }}
        maxLength={200}
        placeholder="Nome da tarefa"
        aria-label={`Nome da tarefa nova em ${nomeDaColuna}`}
        aria-describedby={`${id}-dica`}
        readOnly={pendente}
        className="flex-1 min-w-[12rem]"
      />
      <Button type="button" size="xs" variant="primary" onClick={gravar} disabled={!titulo.trim() || pendente}>
        {pendente ? "Gravando…" : "Gravar"}
      </Button>
      <span id={`${id}-dica`} className="basis-full text-fs-1 text-fg-muted">
        Enter grava e abre a próxima · Esc fecha ·{" "}
        <Link href={hrefDoFormulario} className="underline underline-offset-2 hover:text-brand">
          criar para uma empresa ou pessoa
        </Link>
      </span>
    </div>
  );
}
