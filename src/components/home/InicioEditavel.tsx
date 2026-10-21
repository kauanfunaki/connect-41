"use client";

import { Fragment, useState, useTransition } from "react";
import { Check, Eye, EyeOff, GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/components/ui/Toast";
import type { HomeWidgetKey, HomeWidgetSlot } from "@/lib/homeWidgets";
import type { ActionState } from "@/lib/actionState";

// A ordem da tela, de cima para baixo (os Indicadores descem para depois dos
// painéis em 08/10 — escolha 7A do Kauan).
const FAIXAS: HomeWidgetSlot[] = ["top", "paineis", "abaixo-dos-paineis", "main", "side"];

export type LayoutDoInicio = Record<HomeWidgetSlot, HomeWidgetKey[]>;

/** O bloco leva para `para` dentro da mesma faixa; fora dos limites, nada muda. */
function mover(lista: HomeWidgetKey[], de: number, para: number): HomeWidgetKey[] {
  if (de === para || de < 0 || para < 0 || de >= lista.length || para >= lista.length) return lista;
  const nova = [...lista];
  const [item] = nova.splice(de, 1);
  nova.splice(para, 0, item!);
  return nova;
}

/**
 * O Início com o "Personalizar" na própria tela (escolha 11A dos Ajustes de
 * 15/10, 20/10/2026). O botão liga um modo de edição: os blocos ganham uma
 * alça para arrastar (ou mover pelas setas, com o foco nela) e um olho para
 * esconder, e uma faixa no topo diz o que fazer, com Concluir. Os escondidos
 * ficam listados embaixo, para trazer de volta. Era uma janela com caixas de
 * marcar e setas ↑↓.
 *
 * A ordem vale dentro de cada faixa da tela (topo, painéis, abaixo dos
 * painéis, coluna principal, coluna lateral), como antes: o lugar é do
 * layout, e a preferência só ordena e esconde. Grava o mesmo que a janela
 * gravava (`salvarWidgetsHome`), e só no Concluir.
 *
 * Os blocos chegam prontos do servidor, só os visíveis — o escondido nem é
 * montado. Trazido de volta, ele aparece ao concluir, quando a tela recarrega.
 * A página remonta este componente quando o layout salvo muda (`key`).
 */
export function InicioEditavel({
  titulo,
  subtitulo,
  data,
  criar,
  layout,
  nos,
  disponiveis,
  comDestaques,
  salvar,
  restaurar,
}: {
  titulo: React.ReactNode;
  subtitulo: React.ReactNode;
  /** A data de hoje, ao lado dos botões. */
  data: string;
  /** O "Criar" do cabeçalho. */
  criar: React.ReactNode;
  /** Os visíveis de cada faixa, na ordem salva. */
  layout: LayoutDoInicio;
  /** Os blocos visíveis, já montados no servidor. */
  nos: Partial<Record<HomeWidgetKey, React.ReactNode>>;
  /** Os blocos que esta pessoa pode ligar, com o nome e a faixa de cada um. */
  disponiveis: { key: HomeWidgetKey; rotulo: string; faixa: HomeWidgetSlot }[];
  comDestaques: boolean;
  salvar: (keys: HomeWidgetKey[], ocultos: HomeWidgetKey[]) => Promise<ActionState>;
  restaurar: () => Promise<ActionState>;
}) {
  const visiveisNoLayout = new Set(FAIXAS.flatMap((f) => layout[f]));
  const ocultosIniciais = disponiveis.filter((d) => !visiveisNoLayout.has(d.key)).map((d) => d.key);

  const [atual, setAtual] = useState(layout);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(layout);
  const [escondidos, setEscondidos] = useState(ocultosIniciais);
  const [arrastando, setArrastando] = useState<{ key: HomeWidgetKey; faixa: HomeWidgetSlot } | null>(null);
  const [aviso, setAviso] = useState("");
  const [pendente, startTransition] = useTransition();
  const toast = useToast();

  const rotuloDe = (key: HomeWidgetKey) => disponiveis.find((d) => d.key === key)?.rotulo ?? key;
  const faixaDe = (key: HomeWidgetKey) => disponiveis.find((d) => d.key === key)?.faixa ?? "main";
  const exibido = editando ? rascunho : atual;
  const chaves = (faixa: HomeWidgetSlot) => exibido[faixa];

  function comecar() {
    setRascunho(atual);
    setEscondidos(disponiveis.filter((d) => !FAIXAS.some((f) => atual[f].includes(d.key))).map((d) => d.key));
    setEditando(true);
  }

  function moverNaFaixa(faixa: HomeWidgetSlot, de: number, para: number) {
    setRascunho((r) => ({ ...r, [faixa]: mover(r[faixa], de, para) }));
  }

  function esconder(key: HomeWidgetKey) {
    const faixa = faixaDe(key);
    setRascunho((r) => ({ ...r, [faixa]: r[faixa].filter((k) => k !== key) }));
    setEscondidos((e) => [...e, key]);
    setAviso(`${rotuloDe(key)} escondido.`);
  }

  function mostrar(key: HomeWidgetKey) {
    const faixa = faixaDe(key);
    setEscondidos((e) => e.filter((k) => k !== key));
    setRascunho((r) => ({ ...r, [faixa]: [...r[faixa], key] }));
    setAviso(`${rotuloDe(key)} de volta, no fim da faixa dele.`);
  }

  function concluir() {
    const keys = FAIXAS.flatMap((f) => rascunho[f]);
    startTransition(async () => {
      const r = await salvar(keys, escondidos);
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setAtual(rascunho);
      setEditando(false);
      toast.success("Início salvo.");
    });
  }

  function voltarAoPadrao() {
    startTransition(async () => {
      const r = await restaurar();
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setEditando(false);
      toast.success("Início restaurado ao padrão.");
    });
  }

  function bloco(key: HomeWidgetKey, faixa: HomeWidgetSlot) {
    if (!editando) return <Fragment key={key}>{nos[key]}</Fragment>;
    const lista = rascunho[faixa];
    const i = lista.indexOf(key);
    return (
      <div
        key={key}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          setArrastando({ key, faixa });
        }}
        onDragOver={(e) => {
          if (!arrastando || arrastando.faixa !== faixa) return;
          e.preventDefault();
          if (arrastando.key === key) return;
          moverNaFaixa(faixa, rascunho[faixa].indexOf(arrastando.key), i);
        }}
        onDrop={(e) => e.preventDefault()}
        onDragEnd={() => setArrastando(null)}
        className={`min-w-0 rounded-lg outline-dashed outline-2 outline-offset-2 outline-brand/40 transition-opacity ${
          arrastando?.key === key ? "opacity-50" : ""
        }`}
      >
        <div className="flex items-center gap-2 rounded-t-lg bg-brand-subtle px-2 py-1.5">
          <button
            type="button"
            onKeyDown={(e) => {
              const passo = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : 0;
              if (!passo) return;
              e.preventDefault();
              const para = i + passo;
              if (para < 0 || para >= lista.length) return;
              moverNaFaixa(faixa, i, para);
              setAviso(`${rotuloDe(key)}: posição ${para + 1} de ${lista.length}.`);
              // A linha muda de lugar no DOM; o foco segue a alça dela.
              const alvo = e.currentTarget;
              requestAnimationFrame(() => alvo.focus());
            }}
            aria-label={`Mudar a ordem de ${rotuloDe(key)}: setas`}
            className="inline-flex size-7 flex-shrink-0 cursor-grab items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg active:cursor-grabbing"
          >
            <GripVertical size={16} />
          </button>
          <span className="min-w-0 flex-1 truncate text-fs-2 font-semibold text-fg">{rotuloDe(key)}</span>
          <button
            type="button"
            onClick={() => esconder(key)}
            aria-label={`Esconder ${rotuloDe(key)}`}
            data-dica="Esconder"
            className="inline-flex size-7 flex-shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg"
          >
            <EyeOff size={15} />
          </button>
        </div>
        {/* O conteúdo à vista, mas sem clique: na edição, o bloco é para arrumar. */}
        <div inert className="pointer-events-none select-none">
          {nos[key] ?? (
            <p className="px-4 py-6 text-fs-2 text-fg-muted">
              {key in nos ? "Sem nada para mostrar agora." : "Aparece ao concluir."}
            </p>
          )}
        </div>
      </div>
    );
  }

  const vazio = FAIXAS.every((f) => chaves(f).length === 0);
  const duasColunas = chaves("main").length > 0 && chaves("side").length > 0;

  return (
    <>
      <PageHeader
        title={titulo}
        subtitle={subtitulo}
        action={
          <div className="flex items-center gap-3">
            <p className="hidden sm:block text-helper text-fg-muted tnum">{data}</p>
            {/* O contorno do Connect, na altura do "Criar" ao lado (15/10/2026). */}
            <Button
              variant="secondary"
              size="md"
              onClick={editando ? () => setEditando(false) : comecar}
              aria-pressed={editando}
              title="Personalizar o Início"
            >
              <SlidersHorizontal size={14} />
              <span className="hidden sm:inline">{editando ? "Sair da edição" : "Personalizar"}</span>
            </Button>
            {criar}
          </div>
        }
      />

      {editando && (
        <div
          role="region"
          aria-label="Editando o Início"
          className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-brand/30 bg-brand-subtle px-4 py-2.5 shadow-[var(--c41-shadow-sm)]"
        >
          <SlidersHorizontal size={16} className="flex-shrink-0 text-brand" aria-hidden />
          <p className="font-semibold text-fg">Editando o Início</p>
          <p className="min-w-0 text-fs-2 text-fg-secondary">
            Arraste os blocos para trocar a ordem e use o olho para esconder. Vale só para você.
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={voltarAoPadrao} disabled={pendente}>
              <RotateCcw size={13} /> Restaurar padrão
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditando(false)} disabled={pendente}>
              Cancelar
            </Button>
            <Button size="sm" onClick={concluir} loading={pendente} loadingLabel="Salvando…">
              <Check size={13} /> Concluir
            </Button>
          </div>
          <p className="sr-only" aria-live="polite">
            {aviso}
          </p>
        </div>
      )}

      {chaves("top").map((k) => bloco(k, "top"))}

      {/* Painéis: a grade de gráficos (30/09). Duas colunas até telas bem
          largas — com a sidebar, três painéis a 1440px apertam as barras.
          Com a faixa de destaques em cima (06/10), os gráficos ficam mais
          baixos: o número que manda já está na faixa. */}
      {chaves("paineis").length > 0 && (
        <div
          data-compacto={comDestaques ? "true" : undefined}
          className="group/grade grid grid-cols-1 lg:grid-cols-2 min-[1760px]:grid-cols-3 gap-4 mb-4 items-stretch"
        >
          {chaves("paineis").map((k) => bloco(k, "paineis"))}
        </div>
      )}

      {/* Entre os painéis e as colunas: os Indicadores (08/10, escolha 7A). */}
      {chaves("abaixo-dos-paineis").map((k) => bloco(k, "abaixo-dos-paineis"))}

      {/* Corpo: coluna principal (meu trabalho) + coluna lateral */}
      {(chaves("main").length > 0 || chaves("side").length > 0) && (
        <div className={`grid gap-4 ${duasColunas ? "grid-cols-1 lg:grid-cols-[1.7fr_1fr]" : "grid-cols-1"}`}>
          {chaves("main").length > 0 && <div className="flex flex-col gap-4 min-w-0">{chaves("main").map((k) => bloco(k, "main"))}</div>}
          {chaves("side").length > 0 && <div className="flex flex-col gap-4 min-w-0">{chaves("side").map((k) => bloco(k, "side"))}</div>}
        </div>
      )}

      {editando && escondidos.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border-strong px-4 py-3">
          <span className="text-fs-2 text-fg-muted">Escondidos:</span>
          {escondidos.map((k) => (
            <Button key={k} variant="secondary" size="xs" onClick={() => mostrar(k)}>
              <Eye size={12} /> {rotuloDe(k)}
            </Button>
          ))}
        </div>
      )}

      {vazio && !editando && (
        // No `EmptyState` (15/10/2026): era texto solto.
        <Card>
          <EmptyState
            icon={<EyeOff />}
            title="Todos os blocos estão ocultos"
            description="Use “Personalizar”, no topo, para trazer algum de volta."
          />
        </Card>
      )}
    </>
  );
}
