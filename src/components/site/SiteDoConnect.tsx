import { ArrowRight, Briefcase, Building2, Check, Users, type LucideIcon } from "lucide-react";
import { CenaDasContas } from "@/components/login/CarrosselDaEquipe";
import { CenaDasPendencias } from "@/components/portal/CarrosselDoPortal";
import type { LinksDoSite } from "@/lib/site/links";
import { CONTATO, PARA_A_EQUIPE, PARA_O_CLIENTE, QUEM_OPERA } from "@/lib/site/textos";
import { TelaDeExemplo } from "./TelaDeExemplo";

// O site de apresentação do Connect, na `/` do endereço principal (13/10/2026).
//
// Escolha do Kauan na página de alternativas: a opção C, "Produto e portas
// juntos", com as portas da opção A ("Sou cliente", "Quero trabalhar aqui",
// "Sou da equipe") no lugar do quadro de acesso. A frase do Connect à esquerda
// e as portas à direita; embaixo, o que a equipe e o cliente fazem nele, os
// setores e o rodapé. No celular a frase vem primeiro e as portas logo depois,
// e o topo fica só com o logo e o "Entrar" — sem menu.
//
// Server Component, sem estado: os links para dentro do Connect chegam prontos
// (lib/site/links), e as cores e fontes são as do app (globals.css), nos dois
// temas. Nenhum número, cliente ou depoimento inventado — os textos vêm da
// /sobre (lib/site/textos); as telas de exemplo são as das entradas.

// Largura e respiro de cada faixa da página: 16 px dos lados no celular.
const FAIXA = "mx-auto w-full max-w-[1200px] px-4 sm:px-8 lg:px-14";

const ROTULO = "text-fs-3 font-semibold uppercase tracking-[0.08em] text-brand";

// Títulos do site em escala própria: a do app para em 30 px (--fs-9), feita
// para tela de trabalho, e a primeira dobra de um site pede mais. Crescem com a
// tela, de 34 a 54 px (h1) e de 26 a 34 px (h2), como no desenho aprovado.
const TITULO_1 = "text-[length:clamp(2.125rem,1.6rem_+_2.4vw,3.375rem)] font-semibold leading-[1.05] tracking-[-0.028em] text-fg text-balance";
const TITULO_2 = "text-[length:clamp(1.625rem,1.35rem_+_1.1vw,2.125rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-fg text-balance";

// Os botões do site são links (`<a>` simples, para fora da página ou para um
// e-mail) com o desenho do `ui/Button` — primário e secundário iguais aos do
// app —, mais altos, como pede uma página de entrada. O `ui/Button` é
// componente de cliente, e um link simples não precisa dele.
const BOTAO =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px";
const BOTAO_GRANDE = `${BOTAO} h-11 px-5 text-fs-5 sm:h-[46px]`;
const BOTAO_PEQUENO = `${BOTAO} h-9 px-3.5 text-fs-4 sm:h-[38px]`;
const PRIMARIO = "bg-brand-solid text-on-brand hover:bg-brand-solid-hover shadow-[var(--c41-shadow-xs),inset_0_1px_0_rgba(255,255,255,.14)]";
const SECUNDARIO = "border border-border-strong text-fg hover:bg-surface-hover";

const LINK = "transition-colors hover:text-brand";

type Porta = { Icone: LucideIcon; titulo: string; texto: string; acao: string; href: keyof LinksDoSite };

// As três portas da opção A: cada pessoa acha o seu caminho num clique.
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

// A bolinha na cor de cada setor, a mesma do menu do Connect (--c41-sector-*).
const SETORES: { nome: string; cor: string }[] = [
  { nome: "BPO Financeiro", cor: "bg-sector-bpo" },
  { nome: "Fiscal", cor: "bg-sector-fiscal" },
  { nome: "Departamento Pessoal", cor: "bg-sector-dprh" },
  { nome: "Societário", cor: "bg-sector-societario" },
  { nome: "Recrutamento", cor: "bg-sector-recrutamento" },
  { nome: "Gestão", cor: "bg-sector-gestao" },
];

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

export function SiteDoConnect({ links }: { links: LinksDoSite }) {
  return (
    <div className="flex flex-1 flex-col bg-surface text-fg dark:bg-canvas">
      <header className="border-b border-border">
        <div className={`${FAIXA} flex h-[62px] items-center gap-4 sm:h-[74px] md:gap-8`}>
          <Logo className="h-[25px] flex-none sm:h-[30px]" />
          {/* No celular os links somem e fica só o "Entrar": as portas, logo
              abaixo, já levam a cada lugar. */}
          <nav aria-label="Navegação do site" className="hidden md:block">
            <ul className="flex items-center gap-6 text-fs-5 font-medium text-fg-secondary">
              <li>
                <a href="#o-connect" className={LINK}>
                  O Connect
                </a>
              </li>
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
            </ul>
          </nav>
          <a href={links.entrar} className={`${BOTAO_PEQUENO} ${SECUNDARIO} ml-auto`}>
            Entrar<span className="hidden sm:inline">&nbsp;no Connect</span>
          </a>
        </div>
      </header>

      <main className="flex flex-col">
        {/* Primeira dobra: a frase do Connect e as três portas. */}
        <section
          aria-labelledby="site-titulo"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 900px 420px at 15% -120px, color-mix(in srgb, var(--c41-brand) 16%, transparent), transparent 70%)",
          }}
        >
          <div className={`${FAIXA} grid gap-8 py-10 sm:py-14 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,.88fr)] lg:items-center lg:gap-14 lg:py-[72px]`}>
            <div>
              <p className={ROTULO}>Connect</p>
              <h1 id="site-titulo" className={`mt-3.5 ${TITULO_1}`}>
                A plataforma do escritório de contabilidade
              </h1>
              <p className="mt-4 max-w-[33em] text-fs-6 leading-relaxed text-fg-secondary sm:mt-5 sm:text-fs-7">
                A equipe trabalha no Connect; o cliente acompanha tudo pelo Portal do Cliente, no computador ou no celular.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
                <a href="#o-connect" className={`${BOTAO_GRANDE} ${PRIMARIO}`}>
                  Conhecer o Connect
                </a>
                <a href={`mailto:${CONTATO}`} className={`${BOTAO_GRANDE} ${SECUNDARIO}`}>
                  Falar com a gente
                </a>
              </div>
            </div>

            <div className="flex w-full max-w-[640px] flex-col gap-3.5 lg:max-w-none">
              {PORTAS.map((p) => (
                <a
                  key={p.titulo}
                  href={links[p.href]}
                  className="group flex items-start gap-4 rounded-[14px] border border-border bg-surface px-4 py-5 shadow-lg transition-colors hover:border-brand sm:px-[22px]"
                >
                  <span className="flex size-11 flex-none items-center justify-center rounded-[11px] bg-brand-subtle text-brand">
                    <p.Icone size={22} strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="font-display text-fs-7 font-semibold leading-tight tracking-[-0.01em] text-fg">{p.titulo}</span>
                    <span className="text-fs-5 leading-normal text-fg-secondary">{p.texto}</span>
                    <span className="mt-0.5 inline-flex items-center gap-1.5 text-fs-5 font-semibold text-brand">
                      {p.acao}
                      <ArrowRight size={17} aria-hidden className="flex-none transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </a>
              ))}
              <p className="pl-1 text-fs-3 text-fg-muted">No portal, dá para entrar com a conta Google.</p>
            </div>
          </div>
        </section>

        {/* O que a equipe e o cliente fazem no Connect — as listas da /sobre. */}
        <section id="o-connect" aria-labelledby="o-connect-titulo" className="bg-canvas dark:bg-sidebar-bg">
          <div className={`${FAIXA} py-11 sm:py-16 lg:py-[76px]`}>
            <div className="flex max-w-[46em] flex-col gap-2.5">
              <p className={ROTULO}>O Connect</p>
              <h2 id="o-connect-titulo" className={TITULO_2}>
                Um lugar para a equipe, outro para o cliente, os dois ligados
              </h2>
            </div>
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

        <section aria-labelledby="setores-titulo">
          <div className={`${FAIXA} py-11 sm:py-16 lg:py-[76px]`}>
            <div className="flex max-w-[46em] flex-col gap-2.5">
              <p className={ROTULO}>Setores</p>
              <h2 id="setores-titulo" className={TITULO_2}>
                Cada escritório liga os setores que usa
              </h2>
            </div>
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
    <div className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-5 sm:p-7">
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
