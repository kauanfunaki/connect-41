import { ArrowRight, Briefcase, Building2, Check, Mail, MapPin, Users, type LucideIcon } from "lucide-react";
import { CenaDasContas } from "@/components/login/CarrosselDaEquipe";
import { CenaDasPendencias } from "@/components/portal/CarrosselDoPortal";
import type { LinksDoSite } from "@/lib/site/links";
import { CONTATO, EMPRESA, PARA_A_EQUIPE, PARA_O_CLIENTE, QUEM_OPERA } from "@/lib/site/textos";
import { BlocoDeDestaque } from "./BlocoDeDestaque";
import { BOTAO_GRANDE, FAIXA, LINK, ROTULO, TITULO_2 } from "./estilos";
import { TelaDeExemplo } from "./TelaDeExemplo";

// O site de apresentação do Connect, na `/` do endereço principal.
//
// Versão 2 (13/10/2026), depois do retorno do Kauan sobre a primeira ("muito
// simples e minimalista"), de cima a baixo:
//
// 1. Topo: só o logo e as âncoras das seções desta página (no celular, só o
//    logo). Nada de portal, vagas ou "Entrar" aqui: o topo repetia os destinos
//    das portas, logo abaixo.
// 2. Bloco de destaque (BlocoDeDestaque): o título grande, UM botão, que desce
//    para "O Connect", e os cartões soltos do dia a dia de um escritório.
// 3. As três portas — "Sou cliente", "Quero trabalhar aqui" e "Sou da equipe" —,
//    em linha no computador e empilhadas no celular. Com o rodapé, são os
//    únicos lugares que levam ao portal, às vagas e ao login.
// 4. O Connect: o que a equipe e o cliente fazem nele, com as telas de exemplo.
// 5. Como funciona, em três passos.
// 6. Setores.
// 7. Sobre nós: só o que se sabe pelo próprio Connect — nasceu num escritório
//    de contabilidade e é da 41 TEC LTDA, de Curitiba. Nenhum número, cliente,
//    depoimento ou data inventado.
// 8. O convite para falar com a gente (o e-mail de lib/site/textos) e o rodapé.
//
// Server Component, sem estado: os links para dentro do Connect chegam prontos
// (lib/site/links), e as cores e fontes são as do app (globals.css), nos dois
// temas. As listas e o contato vêm de lib/site/textos, que a /sobre também usa.

// As âncoras do topo: as seções desta página, e só elas.
const SECOES = [
  { id: "o-connect", rotulo: "O Connect" },
  { id: "setores", rotulo: "Setores" },
  { id: "sobre-nos", rotulo: "Sobre nós" },
];

type Porta = { Icone: LucideIcon; titulo: string; texto: string; acao: string; href: keyof LinksDoSite };

// As três portas: cada pessoa acha o seu caminho num clique.
const PORTAS: Porta[] = [
  {
    Icone: Building2,
    titulo: "Sou cliente",
    texto: "Documentos, pendências, aprovações e o financeiro da sua empresa, no computador ou no celular.",
    acao: "Entrar no Portal do Cliente",
    href: "portal",
  },
  {
    Icone: Briefcase,
    titulo: "Quero trabalhar aqui",
    texto: "Vagas abertas nos escritórios que usam o Connect, com a candidatura pelo site.",
    acao: "Ver vagas",
    href: "vagas",
  },
  {
    Icone: Users,
    titulo: "Sou da equipe",
    texto: "Processos, financeiro, documentos fiscais, departamento pessoal e agenda do escritório.",
    acao: "Entrar no Connect",
    href: "entrar",
  },
];

// Os três passos, com as mesmas coisas das listas de lib/site/textos.
const PASSOS = [
  {
    titulo: "O escritório organiza",
    texto: "Cada setor trabalha no Connect: processos, financeiro, documentos fiscais, pessoal e agenda, com os prazos à vista.",
  },
  {
    titulo: "O cliente acompanha pelo portal",
    texto: "No Portal do Cliente, a empresa vê os documentos, responde às pendências, aprova pagamentos e acompanha os processos.",
  },
  {
    titulo: "Tudo fica registrado",
    texto: "Pedidos, respostas, arquivos e aprovações ficam guardados com a empresa, para o escritório e o cliente consultarem depois.",
  },
];

// A bolinha na cor de cada setor, a mesma do menu do Connect (--c41-sector-*).
const SETORES: { nome: string; cor: string }[] = [
  { nome: "BPO Financeiro", cor: "bg-sector-bpo" },
  { nome: "Fiscal", cor: "bg-sector-fiscal" },
  { nome: "Departamento Pessoal", cor: "bg-sector-dprh" },
  { nome: "Societário", cor: "bg-sector-societario" },
  { nome: "Recrutamento", cor: "bg-sector-recrutamento" },
  { nome: "Gestão", cor: "bg-sector-gestao" },
];

// O fundo do convite do fim: o azul cheio da faixa de destaques da Home, igual
// nos dois temas (letra branca: 5,46:1 no tom mais claro), com os pontos do
// bloco de destaque.
const FUNDO_DO_CONVITE: React.CSSProperties = {
  backgroundImage: [
    "radial-gradient(circle, rgba(255,255,255,.14) 1px, transparent 1.6px)",
    "radial-gradient(120% 140% at 50% 0%, var(--c41-destaque-numero-de), var(--c41-destaque-ate) 72%)",
  ].join(", "),
  backgroundSize: "18px 18px, auto",
};

const PONTOS: React.CSSProperties = {
  backgroundImage: "radial-gradient(circle, color-mix(in srgb, var(--c41-fg) 11%, transparent) 1px, transparent 1.6px)",
  backgroundSize: "18px 18px",
};

const RESPIRO_DA_SECAO = "py-11 sm:py-16 lg:py-[76px]";
const BANDA = "bg-canvas dark:bg-sidebar-bg";

function Logo({ className }: { className: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-horizontal-light.svg" alt="Connect" className={`block dark:hidden w-auto ${className}`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/logo-horizontal-dark.svg" alt="Connect" className={`hidden dark:block w-auto ${className}`} />
    </>
  );
}

function CabecalhoDaSecao({ id, rotulo, titulo }: { id: string; rotulo: string; titulo: string }) {
  return (
    <div className="flex max-w-[46em] flex-col gap-2.5">
      <p className={ROTULO}>{rotulo}</p>
      <h2 id={id} className={TITULO_2}>
        {titulo}
      </h2>
    </div>
  );
}

export function SiteDoConnect({ links }: { links: LinksDoSite }) {
  return (
    <div className="flex flex-1 flex-col bg-surface text-fg dark:bg-canvas">
      <header>
        <div className={`${FAIXA} flex h-[62px] items-center gap-4 sm:h-[74px]`}>
          <Logo className="h-[25px] flex-none sm:h-[30px]" />
          {/* No celular, só o logo: o bloco de destaque e as portas vêm logo
              abaixo, e a página é uma rolagem só. */}
          <nav aria-label="Seções da página" className="ml-auto hidden md:block">
            <ul className="flex items-center gap-7 text-fs-5 font-medium text-fg-secondary">
              {SECOES.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={LINK}>
                    {s.rotulo}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="flex flex-col">
        <BlocoDeDestaque />

        {/* As três portas, logo abaixo do bloco. */}
        <section aria-label="Por onde entrar" className={`${FAIXA} pb-11 pt-4 sm:pb-16 sm:pt-6`}>
          <ul className="grid gap-3.5 md:grid-cols-3 md:gap-5">
            {PORTAS.map((p) => (
              <li key={p.titulo} className="flex">
                <a
                  href={links[p.href]}
                  className="group flex w-full items-start gap-4 rounded-[18px] border border-border bg-surface p-4 shadow-[var(--c41-shadow-md)] transition-colors hover:border-brand sm:p-5 md:flex-col md:gap-5 md:p-6"
                >
                  <span className="flex size-11 flex-none items-center justify-center rounded-[11px] bg-brand-subtle text-brand md:size-12 md:rounded-[12px]">
                    <p.Icone size={22} strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="font-display text-fs-7 font-semibold leading-tight tracking-[-0.01em] text-fg md:text-fs-8">
                      {p.titulo}
                    </span>
                    <span className="text-fs-5 leading-normal text-fg-secondary">{p.texto}</span>
                    {/* `mt-auto`: no computador a ação fica no pé do cartão, alinhada
                        entre os três mesmo com textos de tamanhos diferentes. */}
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-1.5 text-fs-5 font-semibold text-brand">
                      {p.acao}
                      <ArrowRight size={17} aria-hidden className="flex-none transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3.5 pl-1 text-fs-3 text-fg-muted">No portal, dá para entrar com a conta Google.</p>
        </section>

        {/* O que a equipe e o cliente fazem no Connect — as listas da /sobre. */}
        <section id="o-connect" aria-labelledby="o-connect-titulo" className={BANDA}>
          <div className={`${FAIXA} ${RESPIRO_DA_SECAO}`}>
            <CabecalhoDaSecao
              id="o-connect-titulo"
              rotulo="O Connect"
              titulo="Um lugar para a equipe, outro para o cliente, os dois ligados"
            />
            <div className="mt-6 grid gap-4 sm:mt-9 md:grid-cols-2 md:gap-6">
              <Coluna titulo="Para a equipe do escritório" itens={PARA_A_EQUIPE}>
                <CenaDasContas />
              </Coluna>
              <Coluna titulo="Para o cliente, no Portal do Cliente" itens={PARA_O_CLIENTE}>
                <CenaDasPendencias />
              </Coluna>
            </div>
            <p className="mt-4 text-fs-2 text-fg-muted">Telas de exemplo, com dados fictícios.</p>
          </div>
        </section>

        <section aria-labelledby="como-funciona-titulo">
          <div className={`${FAIXA} ${RESPIRO_DA_SECAO}`}>
            <CabecalhoDaSecao
              id="como-funciona-titulo"
              rotulo="Como funciona"
              titulo="Do escritório ao cliente, em três passos"
            />
            <ol className="mt-6 grid gap-4 sm:mt-9 md:grid-cols-3 md:gap-6">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="flex flex-col gap-3 rounded-[18px] border border-border bg-surface p-5 sm:p-6">
                  <span
                    aria-hidden
                    className="flex size-10 items-center justify-center rounded-[12px] bg-brand-solid font-display text-fs-7 font-semibold text-on-brand"
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-1 font-display text-fs-7 font-semibold leading-tight tracking-[-0.01em] text-fg">
                    {p.titulo}
                  </h3>
                  <p className="text-fs-5 leading-relaxed text-fg-secondary">{p.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="setores" aria-labelledby="setores-titulo" className={BANDA}>
          <div className={`${FAIXA} ${RESPIRO_DA_SECAO}`}>
            <CabecalhoDaSecao id="setores-titulo" rotulo="Setores" titulo="Cada escritório liga os setores que usa" />
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {SETORES.map((s) => (
                <li
                  key={s.nome}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-[7px] text-fs-4 font-medium text-fg sm:px-4 sm:py-[9px] sm:text-fs-5"
                >
                  <span aria-hidden className={`size-2.5 flex-none rounded-full ${s.cor}`} />
                  {s.nome}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Sobre nós: o texto precisa da revisão do Kauan (PR da versão 2). */}
        <section id="sobre-nos" aria-labelledby="sobre-nos-titulo">
          <div
            className={`${FAIXA} ${RESPIRO_DA_SECAO} grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)] lg:items-center lg:gap-14`}
          >
            <div>
              <CabecalhoDaSecao
                id="sobre-nos-titulo"
                rotulo="Sobre nós"
                titulo="Feito dentro de um escritório de contabilidade"
              />
              <div className="mt-5 flex max-w-[36em] flex-col gap-4 text-fs-6 leading-relaxed text-fg-secondary sm:mt-6 sm:text-fs-7">
                <p>
                  O Connect nasceu dentro de um escritório de contabilidade, para organizar o trabalho dos setores e o
                  atendimento aos clientes.
                </p>
                <p>
                  Por isso cada setor tem o seu espaço no Connect, e o cliente acompanha pelo Portal do Cliente o que o
                  escritório faz pela empresa dele.
                </p>
              </div>
            </div>
            <div
              className="flex flex-col items-start gap-5 rounded-[24px] border border-border bg-canvas p-6 dark:bg-sidebar-bg sm:p-8"
              style={PONTOS}
            >
              <span className="flex size-16 items-center justify-center rounded-[20px] border border-border bg-surface-elevated shadow-[var(--c41-shadow-md)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/symbol-color.svg" alt="" className="size-10 dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/symbol-color-dark-bg.svg" alt="" className="hidden size-10 dark:block" />
              </span>
              <div className="flex flex-col gap-1.5">
                <p className="text-fs-3 font-semibold uppercase tracking-[0.08em] text-fg-muted">Desenvolvido e operado por</p>
                <p className="font-display text-fs-8 font-semibold leading-tight tracking-[-0.01em] text-fg">{EMPRESA.nome}</p>
              </div>
              <p className="inline-flex items-center gap-2 text-fs-5 text-fg-secondary">
                <MapPin size={18} aria-hidden className="flex-none text-brand" />
                {EMPRESA.cidade}
              </p>
            </div>
          </div>
        </section>

        {/* O convite do fim: o e-mail de contato. */}
        <section aria-labelledby="fale-com-a-gente-titulo" className={`${FAIXA} pb-11 sm:pb-16 lg:pb-[76px]`}>
          <div
            className="rounded-[24px] px-5 py-11 text-center sm:rounded-[32px] sm:px-10 sm:py-14 lg:py-16"
            style={FUNDO_DO_CONVITE}
          >
            <h2
              id="fale-com-a-gente-titulo"
              className="font-display text-[length:clamp(1.75rem,1.3rem_+_1.8vw,2.625rem)] font-semibold leading-[1.08] tracking-[-0.025em] text-white text-balance"
            >
              Quer conversar sobre o Connect?
            </h2>
            <p className="mx-auto mt-3 max-w-[30em] text-fs-6 leading-relaxed text-white/90 sm:text-fs-7">
              Mande um e-mail com a sua dúvida ou com o que você precisa.
            </p>
            <a
              href={`mailto:${CONTATO}`}
              className={`${BOTAO_GRANDE} mt-7 bg-white text-brand-700 shadow-[var(--c41-shadow-md)] hover:bg-brand-50`}
            >
              <Mail size={18} aria-hidden className="flex-none" />
              Falar com a gente
            </a>
            <p className="mt-3.5 break-all text-fs-4 text-white/90">{CONTATO}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={`${FAIXA} grid gap-6 py-8 sm:py-11 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:gap-10`}>
          <div>
            <Logo className="h-[25px] sm:h-[30px]" />
            <p className="mt-3.5 max-w-[32em] text-fs-4 leading-relaxed text-fg-muted">{QUEM_OPERA}</p>
          </div>
          <nav aria-label="Links do rodapé">
            <ul className="grid gap-x-6 gap-y-2.5 text-fs-4 text-fg-secondary sm:grid-cols-2">
              <li>
                <a href={links.portal} className={LINK}>
                  Portal do Cliente
                </a>
              </li>
              <li>
                <a href={links.vagas} className={LINK}>
                  Vagas
                </a>
              </li>
              <li>
                <a href={links.entrar} className={LINK}>
                  Entrar no Connect
                </a>
              </li>
              <li>
                <a href={links.privacidade} className={LINK}>
                  Política de privacidade
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTATO}`} className={`${LINK} break-all`}>
                  {CONTATO}
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Coluna({ titulo, itens, children }: { titulo: string; itens: string[]; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-border bg-surface p-5 sm:p-7">
      <h3 className="text-fs-7 font-semibold leading-tight tracking-[-0.01em] text-fg">{titulo}</h3>
      <ul className="flex flex-col gap-2.5 text-fs-6 leading-normal text-fg-secondary">
        {itens.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-[3px] flex size-[18px] flex-none items-center justify-center rounded-full bg-brand-subtle text-brand">
              <Check size={11} strokeWidth={3} />
            </span>
            <span className="min-w-0">{item}</span>
          </li>
        ))}
      </ul>
      {/* Embaixo, alinhada entre as duas colunas mesmo com listas de tamanhos diferentes. */}
      <div className="mt-auto pt-2">
        <TelaDeExemplo>{children}</TelaDeExemplo>
      </div>
    </div>
  );
}
