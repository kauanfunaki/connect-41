import { ArrowDown, Check, Clock } from "lucide-react";
import { BOTAO_GRANDE, FAIXA, PRIMARIO } from "./estilos";

// O bloco de destaque do site (13/10/2026, versão 2).
//
// Pedido do Kauan: a primeira versão "ficou legal, mas muito simples e
// minimalista". Referência que ele mandou: um painel claro com textura
// pontilhada e borda arredondada, o ícone do produto num bloco de app no
// centro, o título enorme em duas linhas (a segunda num tom mais claro), um
// subtítulo curto, UM botão e cartões soltos nos cantos.
//
// Aqui os cartões são o dia a dia de um escritório, com dados fictícios: a
// pendência no post-it (com o visto de feito), os prazos de hoje (com o
// relógio), os processos com a barra da etapa e as integrações. As integrações
// vão só pelo NOME, em fichas neutras: logo de terceiro é marca registrada.
//
// Layout:
// - No computador (lg+), uma grade de 3 colunas × 3 linhas: os cartões nos
//   cantos, o símbolo e o botão na coluna do meio, e o título na linha do meio,
//   de ponta a ponta. A grade garante que cartão nenhum cubra o título, em
//   qualquer largura — sem posição absoluta calculada no olho.
// - No celular e no tablet, o título e o botão vêm primeiro, e os cartões viram
//   uma faixa parada embaixo: dois no celular (o post-it e os processos), os
//   quatro a partir de 640 px. O invólucro deles é uma grade de 2 colunas que
//   vira `contents` no computador, e aí cada cartão ocupa o seu canto da grade
//   de fora.
//
// Server Component, só HTML e CSS. A flutuação dos cartões é a `.c41-flutua`
// (globals.css): sutil, só no computador e desligada com "reduzir movimento".
// Os cartões são decoração (aria-hidden), como as telas de exemplo.

// Textura do painel: o brilho azul no alto e os pontos, nas cores do tema.
const FUNDO_DO_PAINEL: React.CSSProperties = {
  backgroundImage: [
    "radial-gradient(ellipse 760px 420px at 50% -80px, color-mix(in srgb, var(--c41-brand) 15%, transparent), transparent 72%)",
    "radial-gradient(circle, color-mix(in srgb, var(--c41-fg) 13%, transparent) 1px, transparent 1.6px)",
  ].join(", "),
  backgroundSize: "auto, 18px 18px",
};

// O título do bloco cresce com a tela: 34 px no celular, até 72 px. A linha de
// cima ("O escritório inteiro,") cabe numa linha a partir de 640 px.
const TITULO_DESTAQUE =
  "font-display text-[length:clamp(2.125rem,0.9rem_+_4.2vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.035em] text-fg text-balance";

const CARTAO =
  "flex-1 rounded-lg border border-border bg-surface-elevated p-3 text-left shadow-[var(--c41-shadow-md)] sm:p-4";
const TITULO_DO_CARTAO = "text-fs-3 font-semibold text-fg sm:text-fs-4";
const LINHA_DO_CARTAO = "rounded-lg border border-border bg-canvas px-2.5 py-2 dark:bg-surface";

// O bloco de app pequeno que se apoia no canto de um cartão (o visto, o relógio).
const BLOQUINHO =
  "absolute hidden size-14 items-center justify-center rounded-lg border border-border bg-surface-elevated shadow-[var(--c41-shadow-md)] lg:flex";

const PROCESSOS = [
  { nome: "Alteração contratual", etapa: 3, de: 5 },
  { nome: "Abertura de empresa", etapa: 1, de: 4 },
];

const INTEGRACOES = ["Omie", "SPED", "WhatsApp", "Google Agenda"];

export function BlocoDeDestaque() {
  return (
    <section aria-labelledby="site-titulo" className={`${FAIXA} pt-2 sm:pt-4`}>
      <div
        className="overflow-hidden rounded-[24px] border border-border bg-canvas px-4 pb-5 pt-10 dark:bg-sidebar-bg sm:rounded-[32px] sm:px-8 sm:pb-8 sm:pt-14 lg:px-10 lg:py-10"
        style={FUNDO_DO_PAINEL}
      >
        <div className="grid justify-items-center text-center lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-8">
          {/* O símbolo do Connect num bloco de app. */}
          <span className="flex size-[72px] items-center justify-center rounded-[22px] border border-border bg-surface-elevated shadow-[inset_0_-3px_0_rgba(15,26,51,.06),var(--c41-shadow-md)] sm:size-[84px] sm:rounded-[24px] lg:col-start-2 lg:row-start-1 lg:self-end">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/symbol-color.svg" alt="" className="size-11 dark:hidden sm:size-[52px]" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/symbol-color-dark-bg.svg" alt="" className="hidden size-11 dark:block sm:size-[52px]" />
          </span>

          <div className="mt-7 sm:mt-8 lg:col-span-3 lg:row-start-2 lg:mt-0">
            <h1 id="site-titulo" className={TITULO_DESTAQUE}>
              <span className="block">O escritório inteiro,</span>{" "}
              <span className="block text-fg-muted">num lugar só</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[34em] text-fs-6 leading-relaxed text-fg-secondary sm:mt-6 sm:text-fs-7">
              A equipe trabalha no Connect; o cliente acompanha tudo pelo portal, no computador ou no celular.
            </p>
          </div>

          <a
            href="#o-connect"
            className={`${BOTAO_GRANDE} ${PRIMARIO} mt-7 sm:mt-8 lg:col-start-2 lg:row-start-3 lg:mt-0 lg:self-start`}
          >
            Conhecer o Connect
            <ArrowDown size={18} aria-hidden className="flex-none" />
          </a>

          <div className="mt-10 grid w-full max-w-[560px] grid-cols-2 gap-3 sm:mt-12 sm:gap-4 lg:contents">
            {/* Canto de cima, à esquerda: a pendência no post-it, com o visto. */}
            <div
              aria-hidden
              className="c41-flutua relative flex flex-col lg:col-start-1 lg:row-start-1 lg:self-start lg:justify-self-start"
              style={{ animationDelay: "-1.2s" }}
            >
              {/* O post-it é papel: amarelo nos dois temas, a única cor fora dos
                  tokens. Texto escuro sobre ele (mais de 4,5:1 nos dois). */}
              <div className="relative flex-1 rounded-[4px] bg-[#FDEFA6] px-3.5 pb-4 pt-6 text-left text-[#3A300A] shadow-[0_16px_28px_-14px_rgba(15,26,51,.45)] dark:bg-[#EBD579] lg:w-[220px] lg:-rotate-[4deg] lg:px-5 lg:pb-7 lg:pt-8 xl:w-[236px]">
                {/* O alfinete */}
                <span className="absolute left-1/2 top-2 size-3 -translate-x-1/2 rounded-full bg-danger shadow-[0_2px_3px_rgba(0,0,0,.35)] lg:top-3 lg:size-3.5" />
                <p className="text-fs-1 font-semibold uppercase tracking-[0.08em] text-[#6E5A0E]">Pendência</p>
                <p className="mt-1 text-fs-4 font-medium leading-snug lg:mt-1.5 lg:text-fs-6">Enviar o extrato de setembro</p>
              </div>
              <span className={`${BLOQUINHO} -bottom-7 -right-6`}>
                <span className="flex size-8 items-center justify-center rounded-[9px] bg-brand-solid text-on-brand">
                  <Check size={18} strokeWidth={3} />
                </span>
              </span>
            </div>

            {/* Canto de cima, à direita: os prazos de hoje, com o relógio. */}
            <div
              aria-hidden
              className="c41-flutua relative hidden flex-col sm:flex lg:col-start-3 lg:row-start-1 lg:self-start lg:justify-self-end"
              style={{ animationDelay: "-3.6s", animationDuration: "8s" }}
            >
              <div className={`${CARTAO} lg:w-[236px] lg:rotate-[2deg] xl:w-[252px]`}>
                <p className={`${TITULO_DO_CARTAO} lg:pl-9`}>Prazos de hoje</p>
                <ul className="mt-2.5 flex flex-col gap-2">
                  <li className={LINHA_DO_CARTAO}>
                    <span className="block text-fs-3 font-semibold text-fg">Guia do DAS</span>
                    <span className="mt-1 inline-flex rounded-md bg-warning-bg px-1.5 py-0.5 text-fs-2 font-medium text-warning-fg">
                      Vence 20/10
                    </span>
                  </li>
                  <li className={LINHA_DO_CARTAO}>
                    <span className="block text-fs-3 font-semibold text-fg">Reunião com cliente</span>
                    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-brand-subtle px-1.5 py-0.5 text-fs-2 font-medium text-brand">
                      <Clock size={12} className="flex-none" />
                      14:30
                    </span>
                  </li>
                </ul>
              </div>
              <span className={`${BLOQUINHO} -left-5 -top-6 text-fg`}>
                <Clock size={26} strokeWidth={1.8} />
              </span>
            </div>

            {/* Canto de baixo, à esquerda: os processos, com a etapa em barra. */}
            <div
              aria-hidden
              className="c41-flutua flex flex-col lg:col-start-1 lg:row-start-3 lg:self-end lg:justify-self-start"
              style={{ animationDelay: "-5s", animationDuration: "7.5s" }}
            >
              <div className={`${CARTAO} lg:w-[246px] lg:-rotate-[1.5deg] xl:w-[262px]`}>
                <p className={TITULO_DO_CARTAO}>Processos</p>
                <ul className="mt-2.5 flex flex-col gap-2">
                  {PROCESSOS.map((p, i) => (
                    // No celular, só o primeiro: o cartão divide a linha com o post-it.
                    <li key={p.nome} className={`${LINHA_DO_CARTAO} ${i > 0 ? "hidden sm:block" : ""}`}>
                      <span className="block text-fs-3 font-semibold leading-snug text-fg">{p.nome}</span>
                      <span className="mt-1 block text-fs-2 text-fg-muted">{`Etapa ${p.etapa} de ${p.de}`}</span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-border">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${(p.etapa / p.de) * 100}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Canto de baixo, à direita: as integrações, só pelo nome. */}
            <div
              aria-hidden
              className="c41-flutua hidden flex-col sm:flex lg:col-start-3 lg:row-start-3 lg:self-end lg:justify-self-end"
              style={{ animationDelay: "-2.4s", animationDuration: "8.5s" }}
            >
              <div className={`${CARTAO} lg:w-[236px] lg:-rotate-[2deg] xl:w-[252px]`}>
                <p className={TITULO_DO_CARTAO}>Integrações</p>
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {INTEGRACOES.map((nome) => (
                    <li
                      key={nome}
                      className="rounded-md border border-border bg-canvas px-2 py-1 text-fs-2 font-medium text-fg-secondary dark:bg-surface sm:text-fs-3"
                    >
                      {nome}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
