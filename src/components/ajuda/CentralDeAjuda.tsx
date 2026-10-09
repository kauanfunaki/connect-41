"use client";

import { useMemo, useState } from "react";
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
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { VideoDoYouTube } from "@/components/ajuda/VideoDoYouTube";
import { normalizar } from "@/lib/buscaDeTelas";
import { videoDoPrimeiroPasso } from "@/lib/ajuda/videos";

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

/**
 * Os primeiros passos: o que vale em qualquer tela. Escritos a partir do que o
 * Connect faz hoje (30/09) — quando uma destas telas mudar, o texto muda junto.
 * O vídeo de cada um vem do arquivo dos links (`lib/ajuda/videos.ts`, 06/10/2026).
 */
const PRIMEIROS_PASSOS: Passo[] = [
  {
    chave: "meu-dia",
    video: videoDoPrimeiroPasso("meu-dia") ?? undefined,
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
    video: videoDoPrimeiroPasso("busca") ?? undefined,
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
    video: videoDoPrimeiroPasso("setor") ?? undefined,
    titulo: "Trabalhar dentro de um setor",
    resumo: "O menu passa a mostrar só as telas do setor escolhido.",
    icone: <LayoutGrid />,
    passos: [
      "Clique no nome do escritório e do setor, na barra do topo, e escolha o setor na janela “Trocar de setor ou escritório”.",
      "Em \"Todos os setores\", clique no nome do setor em \"Meus setores\" para entrar nele.",
      "Passe o mouse em Cadastros ou num grupo do setor (como Contas) para ver as telas dele ao lado, sem abrir.",
    ],
  },
  {
    chave: "fixar",
    video: videoDoPrimeiroPasso("fixar") ?? undefined,
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
    video: videoDoPrimeiroPasso("filtros") ?? undefined,
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
    video: videoDoPrimeiroPasso("transferir") ?? undefined,
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
    video: videoDoPrimeiroPasso("avisos") ?? undefined,
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
    video: videoDoPrimeiroPasso("tema") ?? undefined,
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

  // Os passos abertos — o vídeo de dentro só existe com o passo aberto, para
  // não seguir tocando escondido quando a pessoa fecha o passo.
  const [passosAbertos, setPassosAbertos] = useState<ReadonlySet<string>>(() => new Set());

  return (
    <div className="space-y-10">
      {/* Busca: a primeira coisa da tela, larga, como a de uma central de ajuda. */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-surface px-5 py-7 sm:px-8 sm:py-9 shadow-[var(--c41-shadow-xs)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--c41-brand-subtle), transparent 70%)" }}
        />
        <p className="relative font-display text-fs-8 sm:text-[26px] font-semibold text-fg leading-tight">Como podemos ajudar?</p>
        <p className="relative mt-1.5 text-body text-fg-muted max-w-[60ch]">{introducao}</p>
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
        <p className="text-body text-fg-muted">
          Nada encontrado para <span className="font-medium text-fg">&ldquo;{busca}&rdquo;</span>. Tente outra palavra, ou o nome da tela.
        </p>
      )}

      {/* O vídeo de cada assunto toca só dentro dele: no passo aberto aqui e no
          artigo da tela (`/ajuda/<chave>`). A seção "Vídeos" que ficava aqui no
          topo repetia os mesmos vídeos — saiu a pedido do Kauan (08/10/2026). */}

      {filtrado.passos.length > 0 && (
        <section>
          <h2 className="font-display text-section font-semibold text-fg mb-3">Primeiros passos</h2>
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
                    <span className="block text-fs-4 font-semibold text-fg">{p.titulo}</span>
                    <span className="block text-helper text-fg-muted mt-0.5">{p.resumo}</span>
                  </span>
                  <ChevronDown size={16} className="mt-1 flex-shrink-0 text-fg-muted transition-transform group-open:rotate-180" />
                </summary>
                {p.video && passosAbertos.has(p.chave) && (
                  <div className="px-4 pb-3 sm:pl-[3.75rem]">
                    <VideoDoYouTube link={p.video} titulo={p.titulo} />
                  </div>
                )}
                <ol className="px-4 pb-4 pl-[3.75rem] space-y-1.5 list-decimal marker:text-fg-muted marker:text-fs-2">
                  {p.passos.map((passo) => (
                    <li key={passo} className="text-fs-3 text-fg-secondary leading-relaxed pl-1">
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
          <h2 className="font-display text-section font-semibold text-fg mb-3">{tituloDasTelas}</h2>
          <ListaDeTelas telas={filtrado.gerais} />
        </section>
      )}

      {filtrado.setores.map((s) => (
        <section key={s.code}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="flex items-center gap-2 font-display text-section font-semibold text-fg">
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

    </div>
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
