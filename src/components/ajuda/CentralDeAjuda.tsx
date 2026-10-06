"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Command,
  Filter,
  LayoutGrid,
  Pin,
  Play,
  Search,
  Send,
  SunMoon,
  Bell,
  ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { VideoDoYouTube } from "@/components/ajuda/VideoDoYouTube";
import { normalizar } from "@/lib/buscaDeTelas";
import { enderecoDaMiniatura, idDoVideo } from "@/lib/ajuda/youtube";

export type TelaDaAjuda = {
  chave: string;
  titulo: string;
  caminho: string;
  descricao: string;
  codigo?: string;
  /** Ícone próprio, quando a tela não usa o do módulo (no portal: Relatório e Exigências). */
  icone?: React.ReactNode;
  /** O passo a passo da tela (`/ajuda/<chave>`), quando existe: o cartão abre ele, e não a tela. */
  artigo?: string;
  /** O vídeo do passo a passo (link do YouTube, de `lib/ajuda/videos.ts`). */
  video?: string;
};
export type SetorDaAjuda = { code: string; rotulo: string; cor: string; telas: TelaDaAjuda[] };

export type PassoDaAjuda = {
  chave: string;
  titulo: string;
  resumo: string;
  icone: React.ReactNode;
  passos: string[];
  /** O vídeo do passo (link do YouTube): toca dentro dele, aberto. */
  video?: string;
};
type Passo = PassoDaAjuda;

/** Um cartão da seção "Vídeos": o vídeo e para onde o "Ver o passo a passo" leva. */
type VideoDaCentral = {
  chave: string;
  titulo: string;
  link: string;
  /** O artigo da tela (`/ajuda/<chave>`), no Connect. */
  artigo?: string;
  /** O passo desta mesma central, no portal — abre e rola até ele. */
  passo?: string;
};

/**
 * Os primeiros passos: o que vale em qualquer tela. Escritos a partir do que o
 * Connect faz hoje (30/09) — quando uma destas telas mudar, o texto muda junto.
 */
const PRIMEIROS_PASSOS: Passo[] = [
  {
    chave: "meu-dia",
    titulo: "Começar o dia pelo Meu dia",
    resumo: "O que é seu para hoje, de todos os setores, numa tela só.",
    icone: <CalendarCheck />,
    passos: [
      "Abra Meu dia, logo abaixo de Início na barra lateral.",
      "No topo estão os números: o que venceu, o que vence em breve, o que parou e o que está andando.",
      "A lista \"Pede você agora\" vem na ordem do que é mais urgente; clique no item para abrir.",
      "Quem coordena um setor troca para \"Meu time\" e vê o trabalho de todos, com a carga de cada pessoa.",
    ],
  },
  {
    chave: "busca",
    titulo: "Achar qualquer coisa com Ctrl+K",
    resumo: "Telas, empresas e pessoas pelo nome, de qualquer lugar.",
    icone: <Command />,
    passos: [
      "Aperte Ctrl+K (ou clique na busca do topo).",
      "Antes de digitar, aparecem as telas que você abriu por último.",
      "Digite parte do nome — sem acento funciona — e aperte Enter para abrir o primeiro resultado.",
    ],
  },
  {
    chave: "setor",
    titulo: "Trabalhar dentro de um setor",
    resumo: "O menu passa a mostrar só as telas do setor escolhido.",
    icone: <LayoutGrid />,
    passos: [
      "No seletor do topo da barra lateral, escolha o setor.",
      "Em \"Todos os setores\", clique no nome do setor em \"Meus setores\" para entrar nele.",
      "Passe o mouse em Cadastros ou num grupo do setor (como Contas) para ver as telas dele ao lado, sem abrir.",
    ],
  },
  {
    chave: "fixar",
    titulo: "Fixar as telas que você mais usa",
    resumo: "Elas ficam no topo da barra lateral, em qualquer setor.",
    icone: <Pin />,
    passos: [
      "Abra a lista de telas do setor (o link \"Todas as telas\" desta central, ou a aba \"Tudo\" de um grupo).",
      "Passe o mouse no cartão da tela e clique no alfinete.",
      "Para soltar, clique no alfinete de novo.",
    ],
  },
  {
    chave: "filtros",
    titulo: "Filtrar uma lista",
    resumo: "O botão Filtros e o funil de cada coluna, como no Excel.",
    icone: <Filter />,
    passos: [
      "O botão Filtros, acima da tabela, abre os filtros da tela com busca dentro de cada um.",
      "O funil ao lado do título de uma coluna filtra só por ela: marque os valores que quer ver.",
      "Os filtros ativos aparecem como etiquetas; o X de cada uma tira o filtro.",
    ],
  },
  {
    chave: "transferir",
    titulo: "Passar um assunto para outro setor",
    resumo: "A transferência leva a empresa, o prazo e a prioridade.",
    icone: <Send />,
    passos: [
      "No Início, use o botão Criar → Transferência, ou abra Transferências na barra lateral.",
      "Escolha a empresa ou pessoa, os setores que recebem, a prioridade e escreva o que precisa ser feito.",
      "O setor que recebe vê a transferência no Meu dia e no Início, e você acompanha a resposta por lá.",
    ],
  },
  {
    chave: "avisos",
    titulo: "Receber avisos",
    resumo: "O sino do topo e as notificações no celular.",
    icone: <Bell />,
    passos: [
      "O sino do topo mostra as últimas notificações; o número é o que você ainda não leu.",
      "Em Configurações → Notificações, ative os avisos no celular e no navegador.",
    ],
  },
  {
    chave: "tema",
    titulo: "Tema claro, escuro ou do aparelho",
    resumo: "O interruptor do topo, e mais opções em Configurações.",
    icone: <SunMoon />,
    passos: [
      "O interruptor ao lado do sino troca entre claro e escuro; a bolinha azul fica no tema que está valendo.",
      "Em Configurações → Aparência, \"Padrão do sistema\" segue o tema do seu computador ou celular.",
    ],
  },
];

function casa(termo: string, ...textos: string[]): boolean {
  return textos.some((t) => normalizar(t).includes(termo));
}

/**
 * A central de ajuda: primeiros passos, telas gerais e as telas de cada setor
 * que a pessoa enxerga, com uma busca que filtra tudo junto.
 *
 * O portal do cliente usa a mesma central (01/10), com os passos e os textos
 * dele e sem setores — por isso passos, títulos e rodapé vêm de fora, com os do
 * Connect como padrão.
 */
export function CentralDeAjuda({
  gerais,
  setores,
  passos: primeirosPassos = PRIMEIROS_PASSOS,
  tituloDasTelas = "Telas de todos os setores",
  introducao = "Procure uma tela, um assunto ou uma dúvida. A busca vale para os primeiros passos e para todas as telas que você enxerga.",
  exemploDeBusca = "Ex.: conciliação, fixar tela, férias…",
  focarBusca = true,
  rodape,
}: {
  gerais: TelaDaAjuda[];
  setores: SetorDaAjuda[];
  passos?: PassoDaAjuda[];
  tituloDasTelas?: string;
  introducao?: string;
  exemploDeBusca?: string;
  /** No celular, focar a busca abre o teclado por cima da página — o portal desliga. */
  focarBusca?: boolean;
  rodape?: React.ReactNode;
}) {
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca);

  const filtrado = useMemo(() => {
    if (!termo) return { passos: primeirosPassos, gerais, setores };
    return {
      passos: primeirosPassos.filter((p) => casa(termo, p.titulo, p.resumo, ...p.passos)),
      gerais: gerais.filter((t) => casa(termo, t.titulo, t.descricao)),
      setores: setores
        .map((s) => ({ ...s, telas: s.telas.filter((t) => casa(termo, t.titulo, t.descricao, s.rotulo)) }))
        .filter((s) => s.telas.length > 0),
    };
  }, [termo, primeirosPassos, gerais, setores]);

  const nada = filtrado.passos.length === 0 && filtrado.gerais.length === 0 && filtrado.setores.length === 0;

  // Os vídeos saem do que está na tela (05/10/2026): a busca filtra os vídeos
  // junto, e o portal só mostra vídeo de passo que o cliente enxerga. Duas
  // telas com o mesmo artigo têm o mesmo vídeo — entra uma vez.
  const videos = useMemo(() => {
    const vistos = new Set<string>();
    const lista: VideoDaCentral[] = [];
    const somar = (v: VideoDaCentral) => {
      const id = idDoVideo(v.link);
      if (!id || vistos.has(id)) return;
      vistos.add(id);
      lista.push(v);
    };
    for (const p of filtrado.passos) if (p.video) somar({ chave: `passo:${p.chave}`, titulo: p.titulo, link: p.video, passo: p.chave });
    for (const t of [...filtrado.gerais, ...filtrado.setores.flatMap((s) => s.telas)]) {
      if (t.video) somar({ chave: `tela:${t.chave}`, titulo: t.titulo, link: t.video, artigo: t.artigo });
    }
    return lista;
  }, [filtrado]);

  // O vídeo aberto na janela. O player só existe com ela aberta: fechou, parou.
  const [assistindo, setAssistindo] = useState<VideoDaCentral | null>(null);

  // Os passos abertos — o vídeo de dentro só existe com o passo aberto, para
  // não seguir tocando escondido quando a pessoa fecha o passo.
  const [passosAbertos, setPassosAbertos] = useState<ReadonlySet<string>>(() => new Set());

  // "Ver o passo a passo" no portal: fecha a janela e abre o passo nesta mesma
  // página. Fica para depois do fechamento porque o Modal devolve o foco ao
  // cartão do vídeo ao fechar, e isso rolaria a página de volta para ele.
  const passoParaAbrir = useRef<string | null>(null);
  useEffect(() => {
    if (assistindo || !passoParaAbrir.current) return;
    const el = document.getElementById(`passo-${passoParaAbrir.current}`);
    passoParaAbrir.current = null;
    if (!(el instanceof HTMLDetailsElement)) return;
    el.open = true;
    el.querySelector("summary")?.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [assistindo]);

  return (
    <div className="space-y-10">
      {/* Busca: a primeira coisa da tela, larga, como a de uma central de ajuda. */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-7 sm:px-8 sm:py-9 shadow-[var(--c41-shadow-xs)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--c41-brand-subtle), transparent 70%)" }}
        />
        <p className="relative font-display text-[22px] sm:text-[26px] font-semibold text-fg leading-tight">Como podemos ajudar?</p>
        <p className="relative mt-1.5 text-[length:var(--fs-body)] text-fg-muted max-w-[60ch]">{introducao}</p>
        <div className="relative mt-5 max-w-xl">
          <Input
            icon={<Search />}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={exemploDeBusca}
            aria-label="Buscar na ajuda"
            autoFocus={focarBusca}
          />
        </div>
      </div>

      {nada && (
        <p className="text-[length:var(--fs-body)] text-fg-muted">
          Nada encontrado para <span className="font-medium text-fg">&ldquo;{busca}&rdquo;</span>. Tente outra palavra, ou o nome da tela.
        </p>
      )}

      {/* Os vídeos de passo a passo, logo abaixo da busca: só com ao menos um
          vídeo, e cada um toca numa janela, sem sair da página (05/10/2026). */}
      {videos.length > 0 && (
        <section>
          <h2 className="font-display text-[length:var(--fs-section)] font-semibold text-fg mb-3">Vídeos</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
            {videos.map((v) => (
              <li key={v.chave}>
                <CartaoDeVideo video={v} onAssistir={() => setAssistindo(v)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {filtrado.passos.length > 0 && (
        <section>
          <h2 className="font-display text-[length:var(--fs-section)] font-semibold text-fg mb-3">Primeiros passos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            {filtrado.passos.map((p) => (
              <details
                key={p.chave}
                id={`passo-${p.chave}`}
                open={Boolean(termo)}
                onToggle={(e) => {
                  const aberto = e.currentTarget.open;
                  setPassosAbertos((atual) => {
                    if (aberto === atual.has(p.chave)) return atual;
                    const proximo = new Set(atual);
                    if (aberto) proximo.add(p.chave);
                    else proximo.delete(p.chave);
                    return proximo;
                  });
                }}
                className="group scroll-mt-6 rounded-lg border border-border bg-surface shadow-[var(--c41-shadow-xs)] open:border-border-strong transition-colors"
              >
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand [&>svg]:size-[17px]">
                    {p.icone}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold text-fg">{p.titulo}</span>
                    <span className="block text-[length:var(--fs-helper)] text-fg-muted mt-0.5">{p.resumo}</span>
                  </span>
                  <ChevronDown size={16} className="mt-1 flex-shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
                </summary>
                {p.video && passosAbertos.has(p.chave) && (
                  <div className="px-4 pb-3 sm:pl-[3.75rem]">
                    <VideoDoYouTube link={p.video} titulo={p.titulo} />
                  </div>
                )}
                <ol className="px-4 pb-4 pl-[3.75rem] space-y-1.5 list-decimal marker:text-fg-muted marker:text-[12px]">
                  {p.passos.map((passo) => (
                    <li key={passo} className="text-[13px] text-fg-secondary leading-relaxed pl-1">
                      {passo}
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        </section>
      )}

      {filtrado.gerais.length > 0 && (
        <section>
          <h2 className="font-display text-[length:var(--fs-section)] font-semibold text-fg mb-3">{tituloDasTelas}</h2>
          <ListaDeTelas telas={filtrado.gerais} />
        </section>
      )}

      {filtrado.setores.map((s) => (
        <section key={s.code}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="flex items-center gap-2 font-display text-[length:var(--fs-section)] font-semibold text-fg">
              <span className="size-2.5 rounded-full flex-shrink-0" style={{ background: s.cor }} aria-hidden />
              {s.rotulo}
            </h2>
            <Link
              href={`/setor/${s.code}/telas`}
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-secondary hover:text-brand transition-colors"
            >
              Todas as telas <ArrowRight size={13} />
            </Link>
          </div>
          <ListaDeTelas telas={s.telas} cor={s.cor} />
        </section>
      ))}

      {rodape}

      <Modal open={assistindo !== null} onClose={() => setAssistindo(null)} title={assistindo?.titulo} maxWidth="max-w-3xl">
        {assistindo && (
          <div className="flex flex-col gap-4">
            <VideoDoYouTube key={assistindo.chave} link={assistindo.link} titulo={assistindo.titulo} iniciar />
            {assistindo.artigo ? (
              <Button variant="secondary" href={assistindo.artigo} className="self-end">
                Ver o passo a passo <ArrowRight size={15} />
              </Button>
            ) : assistindo.passo ? (
              <Button
                variant="secondary"
                className="self-end"
                onClick={() => {
                  passoParaAbrir.current = assistindo.passo ?? null;
                  setAssistindo(null);
                }}
              >
                Ver o passo a passo <ArrowRight size={15} />
              </Button>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** O cartão de um vídeo: miniatura e título. É um botão — abre a janela, não navega. */
function CartaoDeVideo({ video, onAssistir }: { video: VideoDaCentral; onAssistir: () => void }) {
  const id = idDoVideo(video.link);
  if (!id) return null;
  return (
    <button
      type="button"
      onClick={onAssistir}
      aria-label={`Assistir ao vídeo: ${video.titulo}`}
      className="group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-lg border border-border bg-surface text-left shadow-[var(--c41-shadow-xs)] hover:border-border-strong transition-colors"
    >
      <span className="relative block aspect-video w-full bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do YouTube (i.ytimg.com), servida direto ao navegador */}
        <img src={enderecoDaMiniatura(id)} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        <span aria-hidden className="absolute inset-0 bg-black/20 transition-colors group-hover:bg-black/10" />
        <span
          aria-hidden
          className="absolute left-1/2 top-1/2 inline-flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand text-on-brand shadow-[var(--c41-shadow-lg)] transition-transform group-hover:scale-105"
        >
          <Play size={18} className="ml-0.5" fill="currentColor" />
        </span>
      </span>
      <span className="flex items-start gap-2 p-3.5">
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-fg leading-snug">{video.titulo}</span>
      </span>
    </button>
  );
}

function ListaDeTelas({ telas, cor }: { telas: TelaDaAjuda[]; cor?: string }) {
  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch">
      {telas.map((t) => {
        const destino = t.artigo ?? t.caminho;
        const navegavel = destino.startsWith("/");
        const conteudo = (
          <>
            <span
              className="inline-flex size-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-hover [&>svg]:size-4"
              style={{ color: cor ?? "var(--c41-brand)" }}
            >
              {t.icone ?? (t.codigo ? <ModuleIcon code={t.codigo} /> : <LayoutGrid />)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-fg">
                {t.titulo}
                {!navegavel && <kbd className="rounded border border-border px-1 text-[10.5px] font-medium text-fg-muted">{t.caminho}</kbd>}
                {t.artigo && <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10.5px] font-semibold text-brand">Passo a passo</span>}
                {t.video && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-brand/10 px-1.5 py-px text-[10.5px] font-semibold text-brand">
                    <Play size={9} fill="currentColor" aria-hidden /> Vídeo
                  </span>
                )}
              </span>
              <span className="block text-[12.5px] text-fg-muted mt-0.5 leading-snug">{t.descricao}</span>
            </span>
            {navegavel && <ArrowUpRight size={15} className="mt-0.5 flex-shrink-0 text-fg-muted group-hover:text-brand transition-colors" />}
          </>
        );
        const cls = "group h-full flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 shadow-[var(--c41-shadow-xs)]";
        return (
          <li key={t.chave}>
            {navegavel ? (
              <Link href={destino} className={`${cls} hover:border-border-strong transition-colors`}>
                {conteudo}
              </Link>
            ) : (
              <div className={cls}>{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
