"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRightLeft,
  BadgeCheck,
  Bell,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileSignature,
  FileText,
  House,
  Inbox,
  MessagesSquare,
  PanelLeft,
  PartyPopper,
  Search,
  Smartphone,
  Sparkles,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useDialog } from "@/components/ui/useDialog";
import { Ceci } from "@/components/ia/Ceci";
import type { IconeDoTutorial, Tutorial } from "@/lib/tutorial/tutoriais";

/** Como o tutorial terminou. Os dois contam como visto. */
export type FimDoTutorial = "pulou" | "concluiu";

const ICONES: Record<Exclude<IconeDoTutorial, "ceci">, LucideIcon> = {
  "boas-vindas": Sparkles,
  menu: PanelLeft,
  "meu-dia": CalendarCheck,
  "meu-time": Users,
  busca: Search,
  sino: Bell,
  gestor: ArrowRightLeft,
  ajuda: CircleHelp,
  pronto: PartyPopper,
  portal: House,
  solicitacao: Inbox,
  conversa: MessagesSquare,
  pendencia: ClipboardList,
  documentos: FileText,
  aprovacao: BadgeCheck,
  financeiro: Wallet,
  processo: FileSignature,
  celular: Smartphone,
};

const semAssinatura = () => () => {};
const noNavegador = () => true;
const noServidor = () => false;

/**
 * A janela do tutorial do primeiro acesso (13/10/2026) — a mesma na equipe e
 * no portal, no desenho do tutorial do 41 Tech Hub: faixa de cor no topo, o
 * desenho grande de cada passo, bolinhas de progresso clicáveis (a do passo
 * atual vira pílula), "Próximo" e, no último passo, o botão de começar;
 * "Pular tutorial" em todo passo menos no último.
 *
 * Esc e clique fora não fecham, como no Hub: a pessoa sai pelos botões, e
 * qualquer saída (pular ou terminar) conta como visto. As setas do teclado
 * andam entre os passos; o Tab fica preso na janela (`useDialog`).
 *
 * Só existe no navegador: o tutorial do primeiro acesso já nasce aberto, e
 * montado na hidratação o painel trocaria de lugar (do meio da página para o
 * `<body>`) depois de o `useDialog` prender o foco no primeiro.
 */
export function JanelaDoTutorial(props: { tutorial: Tutorial; onFim: (fim: FimDoTutorial) => void }) {
  const montado = useSyncExternalStore(semAssinatura, noNavegador, noServidor);
  if (!montado || props.tutorial.passos.length === 0) return null;
  return createPortal(<Painel {...props} />, document.body);
}

// Esc não faz nada: quem fecha são os botões.
const ignorarEsc = () => {};

function Painel({ tutorial, onFim }: { tutorial: Tutorial; onFim: (fim: FimDoTutorial) => void }) {
  const painelRef = useDialog(true, ignorarEsc);
  const principalRef = useRef<HTMLButtonElement>(null);
  const voltarRef = useRef<HTMLButtonElement>(null);
  const pularRef = useRef<HTMLButtonElement>(null);
  const [indice, setIndice] = useState(0);
  const id = useId();
  const tituloId = `${id}-titulo`;
  const textoId = `${id}-texto`;

  const total = tutorial.passos.length;
  const atual = Math.min(indice, total - 1);
  const passo = tutorial.passos[atual]!;
  const ultimo = atual === total - 1;

  // O foco começa no botão principal, e não na primeira bolinha (o primeiro
  // controle da janela, que o `useDialog` focaria): Enter já avança. Roda
  // depois do efeito do `useDialog`, que vem antes neste componente.
  useEffect(() => {
    principalRef.current?.focus();
  }, []);

  function ir(i: number) {
    const destino = Math.max(0, Math.min(total - 1, i));
    // O "Voltar" some no primeiro passo e o "Pular" no último: com o foco num
    // deles, ele iria para o nada. Vai antes para o botão principal.
    const foco = document.activeElement;
    if ((destino === 0 && foco === voltarRef.current) || (destino === total - 1 && foco === pularRef.current)) {
      principalRef.current?.focus();
    }
    setIndice(destino);
  }
  const avancar = () => (ultimo ? onFim("concluiu") : ir(atual + 1));

  function tecla(e: React.KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      ir(atual + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ir(atual - 1);
    }
  }

  return (
    <div className="c41-esmaecer fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={textoId}
        tabIndex={-1}
        onKeyDown={tecla}
        className="c41-surgir relative flex w-full max-w-[440px] max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl border border-border-strong bg-surface-elevated shadow-lg outline-none"
      >
        {/* A faixa de cor do topo, como no Hub. */}
        <div
          aria-hidden
          className="h-1.5 flex-shrink-0"
          style={{ background: "linear-gradient(90deg, var(--c41-brand-600), var(--c41-brand-400))" }}
        />

        <div className="flex-1 overflow-y-auto px-6 pt-7 pb-2 sm:px-8">
          {/* `aria-live` numa caixa que fica: o leitor de tela lê o passo novo
              quando a pessoa avança. Dentro, o `key` faz o passo novo entrar
              com o mesmo esmaecer da janela. */}
          <div aria-live="polite">
            <div key={atual} className="c41-esmaecer flex flex-col items-center text-center">
              <Desenho icone={passo.icone} />
              {passo.selo && <p className="c41-rotulo mt-5 max-w-full truncate">{passo.selo}</p>}
              <h2
                id={tituloId}
                className={`font-display text-fs-8 font-semibold leading-tight text-fg text-balance ${passo.selo ? "mt-1.5" : "mt-5"}`}
              >
                {passo.titulo}
              </h2>
              <p id={textoId} className="mt-2.5 text-body leading-relaxed text-fg-secondary text-pretty">
                {passo.texto}
              </p>
              {passo.itens && passo.itens.length > 0 && (
                <ul className="mt-4 w-full space-y-2 rounded-lg bg-surface-2 px-4 py-3 text-left">
                  {passo.itens.map((item) => (
                    <li key={item} className="flex gap-2.5 text-fs-3 leading-snug text-fg-secondary">
                      <Check size={15} aria-hidden className="mt-0.5 flex-shrink-0 text-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 px-6 pt-4 pb-5 sm:px-8">
          {/* As bolinhas: a do passo atual vira pílula. O alvo de cada uma é de
              24px — a bolinha de 8px sozinha seria pequena demais no dedo. */}
          <div role="group" aria-label="Passos do tutorial" className="mb-4 flex flex-wrap items-center justify-center">
            {tutorial.passos.map((p, i) => (
              <button
                key={p.chave}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Passo ${i + 1}: ${p.titulo}`}
                aria-current={i === atual ? "step" : undefined}
                className="group inline-flex h-6 min-w-6 items-center justify-center rounded-full px-0.5"
              >
                <span
                  aria-hidden
                  className={`block h-2 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${
                    i === atual ? "w-6 bg-brand" : "w-2 bg-border-strong group-hover:bg-fg-muted"
                  }`}
                />
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {ultimo ? (
              <span />
            ) : (
              <Button ref={pularRef} variant="ghost" size="md" className="-ml-2" onClick={() => onFim("pulou")}>
                Pular tutorial
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              {atual > 0 && (
                <Button ref={voltarRef} variant="secondary" size="md" onClick={() => ir(atual - 1)}>
                  <ChevronLeft size={15} aria-hidden /> Voltar
                </Button>
              )}
              <Button ref={principalRef} size="md" onClick={avancar}>
                {ultimo ? (
                  tutorial.botaoFinal
                ) : (
                  <>
                    Próximo <ChevronRight size={15} aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <p className="flex-shrink-0 border-t border-border px-6 py-2.5 text-center text-helper text-fg-muted">
          {tutorial.rotulo} · Passo {atual + 1} de {total}
        </p>
      </div>
    </div>
  );
}

/** O desenho grande do passo: a Ceci no passo dela, e um ícone numa bolha nos outros. */
function Desenho({ icone }: { icone: IconeDoTutorial }) {
  if (icone === "ceci") return <Ceci tamanho={72} />;
  const Icone = ICONES[icone];
  return (
    <span aria-hidden className="inline-flex size-[72px] items-center justify-center rounded-2xl bg-brand-subtle text-brand">
      <Icone size={34} strokeWidth={1.75} />
    </span>
  );
}
