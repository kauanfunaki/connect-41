"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Check, Palette } from "lucide-react";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { useToast } from "@/components/ui/Toast";
import { CORES_DA_CAPA, corDaCapa, type CorDaCapa } from "@/lib/kanban/capa";

type Props = {
  /** A chave gravada; nula = sem cor. */
  valor: string | null;
  /** Grava a escolha. Devolve `{ error }` quando o servidor recusa. */
  onEscolher: (cor: CorDaCapa | null) => Promise<{ error: string } | void | null>;
  /** O nome do campo ("Capa", "Cor no quadro") — vai no botão e no título do painel. */
  rotulo: string;
  /** A opção de tirar a cor ("Sem capa", "Sem cor"). */
  textoSemCor: string;
  /** De quem é a cor, para o leitor de tela ("Cor de Constituição"). Padrão: o rótulo. */
  "aria-label"?: string;
  /** Uma linha embaixo das cores, no painel. */
  ajuda?: string;
};

/**
 * O seletor da capa do cartão e da cor do tipo de processo (27/11/2026,
 * funcionalidade-845). Um botão com a amostra e o nome da cor abre o painel no
 * modelo do de Filtros: o rótulo em caixa alta, as dez cores da paleta e o
 * "Sem capa" embaixo.
 *
 * As cores são rádios de verdade por baixo (como no `SeletorDeCor`): as setas
 * andam entre elas e o leitor de tela lê o nome. O clique grava na hora e fecha
 * o painel; o botão já mostra a cor nova enquanto o servidor responde e volta à
 * de antes, com aviso, se a gravação falhar.
 */
export function SeletorDeCapa({ valor, onEscolher, rotulo, textoSemCor, "aria-label": ariaLabel, ajuda }: Props) {
  const [aberto, setAberto] = useState(false);
  const [escolhida, setEscolhida] = useState<string | null>(valor);
  // A cor mudou por fora (a página revalidou): o botão acompanha.
  const [valorAntes, setValorAntes] = useState(valor);
  if (valor !== valorAntes) {
    setValorAntes(valor);
    setEscolhida(valor);
  }
  const [gravando, startTransition] = useTransition();
  const toast = useToast();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const idDoPainel = useId();
  const nomeDoGrupo = useId();
  const atual = corDaCapa(escolhida);
  const nome = ariaLabel ?? rotulo;

  // Ao abrir, o foco vai para a cor marcada (ou para a primeira).
  useEffect(() => {
    if (!aberto) return;
    const quadro = requestAnimationFrame(() => {
      const raiz = conteudoRef.current;
      (raiz?.querySelector<HTMLInputElement>('input[type="radio"]:checked') ?? raiz?.querySelector<HTMLInputElement>('input[type="radio"]'))?.focus();
    });
    return () => cancelAnimationFrame(quadro);
  }, [aberto]);

  function fechar() {
    setAberto(false);
    botaoRef.current?.focus();
  }

  // O clique no rádio chega duas vezes (o `click` do rótulo e o `change` do
  // rádio): a ref, atualizada na hora, segura a segunda gravação.
  const ultimaRef = useRef<string | null>(valor);
  useEffect(() => {
    ultimaRef.current = escolhida;
  }, [escolhida]);

  function escolher(cor: CorDaCapa | null) {
    if (cor === ultimaRef.current) return;
    const antes = ultimaRef.current;
    ultimaRef.current = cor;
    setEscolhida(cor);
    startTransition(async () => {
      const voltar = (aviso: string) => {
        ultimaRef.current = antes;
        setEscolhida(antes);
        toast.error(aviso);
      };
      try {
        const r = await onEscolher(cor);
        if (r && "error" in r) voltar(r.error);
      } catch {
        voltar("Não deu para falar com o servidor. A cor não mudou.");
      }
    });
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idDoPainel : undefined}
        aria-label={`${nome}: ${atual ? atual.nome : textoSemCor}`}
        aria-busy={gravando || undefined}
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex h-7 max-w-full cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-button-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
          aberto ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg hover:bg-surface-hover"
        }`}
      >
        {atual ? (
          <span aria-hidden className="size-3.5 flex-shrink-0 rounded-sm shadow-[inset_0_0_0_1px_rgb(0_0_0/0.15)]" style={{ background: atual.fundo }} />
        ) : (
          <Palette size={12} aria-hidden />
        )}
        <span className="truncate">
          {rotulo}
          {atual ? `: ${atual.nome}` : ""}
        </span>
        {gravando && <span className="text-fg-muted font-normal">· salvando…</span>}
      </button>
      <PainelFlutuante
        id={idDoPainel}
        ancora={botaoRef}
        aberto={aberto}
        onFechar={() => setAberto(false)}
        largura={248}
        aria-label={nome}
        folhaNoCelular
        className="p-3"
      >
        <div
          ref={conteudoRef}
          className="flex flex-col gap-2.5"
          onKeyDown={(e) => {
            // Só o painel: o modal da tarefa em volta continua aberto.
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              fechar();
            }
          }}
        >
          <p className="c41-rotulo px-1">{rotulo}</p>
          <div role="radiogroup" aria-label={nome} className="grid grid-cols-5 gap-1.5">
            {CORES_DA_CAPA.map((cor) => {
              const marcada = escolhida === cor.chave;
              return (
                <label
                  key={cor.chave}
                  title={cor.nome}
                  // `detail` 0 é o clique que as setas sintetizam no rádio: só o
                  // clique de verdade fecha o painel (como no `SeletorDeCor`).
                  onClick={(e) => {
                    if (e.detail === 0) return;
                    escolher(cor.chave);
                    fechar();
                  }}
                  className={`relative h-8 cursor-pointer rounded-md has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus-ring ${
                    marcada ? "outline-2 outline-offset-2 outline-fg" : ""
                  }`}
                  style={{ background: cor.fundo }}
                >
                  <input
                    type="radio"
                    name={nomeDoGrupo}
                    form=""
                    value={cor.chave}
                    checked={marcada}
                    onChange={() => escolher(cor.chave)}
                    aria-label={cor.nome}
                    className="absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-md opacity-0"
                  />
                  <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)]">
                    {marcada && <Check size={14} strokeWidth={3} style={{ color: cor.tinta }} />}
                  </span>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              escolher(null);
              fechar();
            }}
            aria-pressed={escolhida === null}
            className={`inline-flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border text-button-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              escolhida === null ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg-secondary hover:bg-surface-hover"
            }`}
          >
            {escolhida === null && <Check size={12} aria-hidden />}
            {textoSemCor}
          </button>
          {ajuda && <p className="px-1 text-fs-1 text-fg-muted">{ajuda}</p>}
        </div>
      </PainelFlutuante>
    </>
  );
}
