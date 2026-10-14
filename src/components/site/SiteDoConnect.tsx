import {
  ArrowRight,
  Building2,
  CalendarClock,
  DoorOpen,
  LockKeyhole,
  Mail,
  MapPin,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Ceci } from "@/components/ia/Ceci";
import type { LinksDoSite } from "@/lib/site/links";
import { CONTATO, EMPRESA, QUEM_OPERA } from "@/lib/site/textos";
import { BOTAO_DO_TOPO, BOTAO_GRANDE, CARTAO, FAIXA, LINK, PRIMARIO, RESPIRO, TITULO_2 } from "./estilos";
import { AnelDoConnect, Logo, Rotulo } from "./Marca";
import { MosaicoDoConnect } from "./MosaicoDoConnect";
import { NavegacaoDoTopo, type SecaoDoTopo } from "./NavegacaoDoTopo";
import { PerguntasFrequentes } from "./PerguntasFrequentes";
import { AuraDaPrimeiraDobra, PrimeiraDobra } from "./PrimeiraDobra";
import { SecaoDaCeci } from "./SecaoDaCeci";

// O site de apresentação do Connect, na `/` do endereço principal.
//
// Versão 3 (13/10/2026). Retorno do Kauan sobre a 2: ficou "extremamente
// parecida com a referência, deixando muito superficial". A referência nova é
// um vídeo de um site de produto de IA, mais dinâmico — vale pelo ritmo, e a
// página é do Connect: o anel e o nó do logo como motivo, a paleta azul, as
// cores dos setores como acento, a Ceci como personagem e telas do próprio
// Connect. De cima a baixo:
//
//  1. Topo fixo: logo | âncoras | "Entrar no Connect". O botão voltou ao topo
//     porque gente da 41 não achou como entrar e desceu até o rodapé; fica à
//     vista no celular também (as âncoras vão para um menu). Com a sessão da
//     equipe no navegador, ele vira "Abrir o Connect" e leva ao /home.
//  2. Primeira dobra (PrimeiraDobra): o título sobre a aura do anel, UM botão,
//     e a tela do Connect com a Ceci abrindo o chat subindo por baixo.
//  3. As duas portas — "Sou cliente" e "Sou da equipe". A das vagas ("Quero
//     trabalhar aqui") saiu em 14/10/2026, com o rodapé: o portal de vagas é
//     da 41 e ganhou endereço próprio (o 41 Carreiras), fora do site do
//     Connect. O assistente do WhatsApp do Recrutamento continua no mosaico —
//     é recurso do Connect.
//  4. A Ceci (SecaoDaCeci), o ponto alto: a IA em cada setor, com uma
//     conversa de exemplo por setor; no Portal do Cliente, "Em breve".
//  5. O Connect (MosaicoDoConnect): os recursos de verdade, num mosaico.
//  6. Seguro e organizado: permissões por setor, registro de quem fez o quê,
//     cada escritório com os seus dados, o aviso de certificado vencendo.
//  7. Sobre nós: o texto da versão 2, com a 41 TEC LTDA, de Curitiba.
//  8. Perguntas frequentes (PerguntasFrequentes), em acordeão.
//  9. O convite para falar com a gente (o e-mail de lib/site/textos) e o
//     rodapé em colunas.
//
// Nenhum número, cliente, depoimento, porcentagem ou prazo inventado; nada de
// foto ou imagem de fora — o desenho é CSS, SVG e componentes do app. Os dados
// das telas de exemplo são fictícios e a página diz isso.
//
// Server Component. Cliente só onde precisa: o menu do topo
// (NavegacaoDoTopo), a troca de setor da Ceci (CeciNosSetores) e o acordeão
// das perguntas. O movimento é CSS (globals.css, bloco do site), sutil e
// desligado com "reduzir movimento"; parada, a página está inteira.

// As âncoras do topo: as seções desta página, na ordem dela.
const SECOES: SecaoDoTopo[] = [
  { id: "ceci", rotulo: "A Ceci" },
  { id: "o-connect", rotulo: "O Connect" },
  { id: "seguranca", rotulo: "Segurança" },
  { id: "sobre-nos", rotulo: "Sobre nós" },
  { id: "perguntas", rotulo: "Perguntas" },
];

type Porta = { Icone: LucideIcon; titulo: string; texto: string; acao: string; href: string };

// Seguro e organizado: só o que o Connect faz — as permissões por setor e os
// campos sensíveis (admin/permissoes-sensiveis), a auditoria (admin/auditoria),
// o escritório separado (tenant), os avisos de lib/certificados e a entrada
// própria do portal. Sem número inventado.
const SEGURANCA: { Icone: LucideIcon; titulo: string; texto: string }[] = [
  {
    Icone: LockKeyhole,
    titulo: "Permissões por setor",
    texto: "Cada pessoa trabalha nos setores dela. Salário e dado médico só aparecem para quem tem a permissão.",
  },
  {
    Icone: ScrollText,
    titulo: "Registro de quem fez o quê",
    texto: "As principais alterações — criar, editar, excluir, transferir — ficam registradas com o nome de quem fez e quando.",
  },
  {
    Icone: Building2,
    titulo: "Cada escritório com os seus dados",
    texto: "As empresas, as pessoas e os arquivos de um escritório não aparecem para outro.",
  },
  {
    Icone: CalendarClock,
    titulo: "Aviso de certificado vencendo",
    texto: "O Connect avisa 60, 30, 15 e 7 dias antes de um certificado digital vencer. O arquivo e a senha dele não entram no sistema.",
  },
  {
    Icone: DoorOpen,
    titulo: "Portal com entrada própria",
    texto: "O cliente entra pelo Portal do Cliente, separado da entrada da equipe, e vê só as empresas dele.",
  },
];

export function SiteDoConnect({ links, temSessao = false }: { links: LinksDoSite; temSessao?: boolean }) {
  // Com o cookie da sessão da equipe no navegador (só a presença, conferida
  // em app/page.tsx), o botão leva direto ao Connect.
  const entrada = temSessao ? { href: links.abrir, rotulo: "Abrir o Connect" } : { href: links.entrar, rotulo: "Entrar no Connect" };

  // As duas portas: cada pessoa acha o seu caminho num clique.
  const portas: Porta[] = [
    {
      Icone: Building2,
      titulo: "Sou cliente",
      texto: "Documentos, pendências, aprovações e o financeiro da sua empresa, no computador ou no celular.",
      acao: "Entrar no Portal do Cliente",
      href: links.portal,
    },
    {
      Icone: Users,
      titulo: "Sou da equipe",
      texto: "Processos, financeiro, documentos fiscais, departamento pessoal e agenda — com a Ceci em cada setor.",
      acao: entrada.rotulo,
      href: entrada.href,
    },
  ];

  return (
    <div className="c41-site relative isolate flex flex-1 flex-col overflow-x-clip bg-[var(--c41-site-fundo)] text-fg">
      <div className="absolute inset-x-0 top-0 -z-10">
        <AuraDaPrimeiraDobra />
      </div>

      <header className="c41-site-topo sticky top-0 z-50">
        <div className={`${FAIXA} flex h-16 items-center gap-2 sm:gap-4`}>
          <a href="#inicio" aria-label="Connect, início da página" className="flex-none rounded-md">
            <Logo className="h-[22px] sm:h-[26px]" />
          </a>
          <NavegacaoDoTopo secoes={SECOES} />
          <a href={entrada.href} className={`${BOTAO_DO_TOPO} ${PRIMARIO} ml-auto lg:ml-0`}>
            {entrada.rotulo}
          </a>
        </div>
      </header>

      <main className="relative flex flex-col">
        <PrimeiraDobra />

        {/* As duas portas, logo depois da primeira dobra: lado a lado no
            computador, uma embaixo da outra no celular. */}
        <section aria-label="Por onde entrar" className={`${FAIXA} pb-20 pt-16 sm:pb-24 sm:pt-20`}>
          <ul className="grid gap-3.5 md:grid-cols-2 md:gap-5">
            {portas.map((p) => (
              <li key={p.titulo} className="c41-site-surge flex">
                <a
                  href={p.href}
                  className={`${CARTAO} group relative flex w-full items-start gap-4 overflow-hidden p-5 transition-[border-color,transform] hover:border-brand motion-safe:hover:-translate-y-0.5 sm:p-6 md:flex-col md:gap-6 md:p-7`}
                >
                  {/* O anel do símbolo, grande e apagado, no canto. */}
                  <AnelDoConnect
                    centro={false}
                    className="pointer-events-none absolute -right-10 -top-10 size-36 text-brand opacity-[.07] transition-opacity group-hover:opacity-[.14]"
                  />
                  <span className="relative flex size-11 flex-none items-center justify-center rounded-[12px] bg-brand-subtle text-brand md:size-12">
                    <p.Icone size={22} strokeWidth={1.8} aria-hidden />
                  </span>
                  <span className="relative flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="font-display text-fs-7 font-medium leading-tight tracking-[-0.01em] text-fg md:text-fs-8">{p.titulo}</span>
                    <span className="text-fs-5 leading-normal text-fg-secondary">{p.texto}</span>
                    {/* `mt-auto`: no computador a ação fica no pé do cartão, alinhada
                        entre os dois mesmo com textos de tamanhos diferentes. */}
                    <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-fs-5 font-semibold text-brand">
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

        <SecaoDaCeci />

        <MosaicoDoConnect />

        <section id="seguranca" aria-labelledby="seguranca-titulo" className={`${FAIXA} scroll-mt-16`}>
          <div
            className="c41-site-escuro c41-site-surge relative overflow-hidden rounded-[28px] px-5 py-14 text-white sm:rounded-[36px] sm:px-10 sm:py-16 lg:px-14 lg:py-20"
            style={{ background: "radial-gradient(120% 110% at 0% 0%, var(--c41-destaque-de), var(--c41-destaque-ate) 72%)" }}
          >
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <AnelDoConnect centro={false} className="absolute -bottom-56 -right-40 size-[620px] text-white/[.07]" />
              <AnelDoConnect centro={false} className="absolute -bottom-24 -right-8 size-[300px] text-white/[.06]" />
            </div>
            <div className="relative">
              <Rotulo escuro>Seguro e organizado</Rotulo>
              <h2 id="seguranca-titulo" className={`${TITULO_2} mt-4 max-w-[16em] text-white`}>
                Cada um vê o que é seu. E fica registrado quem fez o quê.
              </h2>
              <ul className="mt-10 grid gap-3.5 sm:mt-12 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                {SEGURANCA.map((s) => (
                  <li
                    key={s.titulo}
                    className="flex flex-col gap-3 rounded-2xl bg-white/[.07] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)] backdrop-blur-md sm:p-6"
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl bg-white/[.12] text-white">
                      <s.Icone size={19} strokeWidth={1.8} aria-hidden />
                    </span>
                    <h3 className="font-display text-fs-7 font-medium leading-tight text-white">{s.titulo}</h3>
                    <p className="text-fs-4 leading-relaxed text-white/90">{s.texto}</p>
                  </li>
                ))}
                {/* A Ceci segue as mesmas regras — no azul-marinho do palco dela. */}
                <li className="c41-site-ceci-no-palco flex flex-col gap-3 rounded-2xl bg-[var(--c41-site-palco)]/60 p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.16)] sm:p-6">
                  <Ceci tamanho={40} />
                  <h3 className="font-display text-fs-7 font-medium leading-tight text-white">A Ceci, com as mesmas regras</h3>
                  <p className="text-fs-4 leading-relaxed text-white/90">
                    Ela só enxerga o que a pessoa que pergunta já pode ver, e não altera nada sem uma pessoa confirmar.
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Sobre nós: o texto da versão 2, que ainda pede a revisão do Kauan. */}
        <section id="sobre-nos" aria-labelledby="sobre-nos-titulo" className="scroll-mt-16">
          <div className={`${FAIXA} ${RESPIRO} grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,.75fr)] lg:items-end lg:gap-16`}>
            <div className="c41-site-surge">
              <Rotulo>Sobre nós</Rotulo>
              <h2 id="sobre-nos-titulo" className={`${TITULO_2} mt-4 text-fg`}>
                Feito dentro de um escritório de contabilidade
              </h2>
              <div className="mt-6 flex max-w-[36em] flex-col gap-4 text-fs-6 leading-relaxed text-fg-secondary sm:text-fs-7">
                <p>
                  O Connect nasceu dentro de um escritório de contabilidade, para organizar o trabalho dos setores e o atendimento aos
                  clientes.
                </p>
                <p>
                  Por isso cada setor tem o seu espaço no Connect, e o cliente acompanha pelo Portal do Cliente o que o escritório faz pela
                  empresa dele.
                </p>
              </div>
            </div>
            <div className={`c41-site-surge ${CARTAO} relative flex flex-col items-start gap-5 overflow-hidden p-6 sm:p-8`}>
              <AnelDoConnect centro={false} className="pointer-events-none absolute -bottom-16 -right-16 size-56 text-brand opacity-[.08]" />
              <span className="relative flex size-16 items-center justify-center rounded-[20px] border border-border bg-surface-elevated shadow-[var(--c41-shadow-md)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/symbol-color.svg" alt="" className="size-10 dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/symbol-color-dark-bg.svg" alt="" className="hidden size-10 dark:block" />
              </span>
              <div className="relative flex flex-col gap-1.5">
                <p className="font-mono text-fs-2 font-medium uppercase tracking-[0.12em] text-fg-muted">Desenvolvido e operado por</p>
                <p className="font-display text-fs-8 font-medium leading-tight tracking-[-0.01em] text-fg">{EMPRESA.nome}</p>
              </div>
              <p className="relative inline-flex items-center gap-2 text-fs-5 text-fg-secondary">
                <MapPin size={18} aria-hidden className="flex-none text-brand" />
                {EMPRESA.cidade}
              </p>
            </div>
          </div>
        </section>

        <PerguntasFrequentes />

        {/* O convite do fim: a aura da primeira dobra de volta, e o e-mail. */}
        <section aria-labelledby="fale-com-a-gente-titulo" className={`${FAIXA} pb-20 sm:pb-24 lg:pb-32`}>
          <div className="c41-site-surge c41-site-aura relative overflow-hidden rounded-[28px] border border-border px-5 py-14 text-center sm:rounded-[36px] sm:px-10 sm:py-20">
            <AnelDoConnect
              centro={false}
              className="pointer-events-none absolute left-1/2 top-1/2 size-[560px] -translate-x-1/2 -translate-y-1/2 text-brand opacity-[.07] sm:size-[720px]"
            />
            <div className="relative flex flex-col items-center">
              <Ceci tamanho={72} estado="deuCerto" />
              <h2 id="fale-com-a-gente-titulo" className={`${TITULO_2} mt-6 text-fg`}>
                Quer conversar sobre o Connect?
              </h2>
              <p className="mx-auto mt-4 max-w-[30em] text-fs-6 leading-relaxed text-fg-secondary sm:text-fs-7">
                Mande um e-mail com a sua dúvida ou com o que o seu escritório precisa.
              </p>
              <a href={`mailto:${CONTATO}`} className={`${BOTAO_GRANDE} ${PRIMARIO} mt-8`}>
                <Mail size={18} aria-hidden className="flex-none" />
                Falar com a gente
              </a>
              <p className="mt-3.5 break-all text-fs-4 text-fg-secondary">{CONTATO}</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className={`${FAIXA} grid gap-10 py-12 sm:grid-cols-2 sm:py-14 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] lg:gap-12`}>
          <div className="sm:col-span-2 lg:col-span-1">
            <Logo className="h-[24px] sm:h-[28px]" />
            <p className="mt-4 max-w-[30em] text-fs-4 leading-relaxed text-fg-muted">{QUEM_OPERA}</p>
          </div>
          <ColunaDoRodape titulo="Nesta página">
            {SECOES.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={LINK}>
                  {s.rotulo}
                </a>
              </li>
            ))}
          </ColunaDoRodape>
          <ColunaDoRodape titulo="Acessos">
            <li>
              <a href={links.portal} className={LINK}>
                Portal do Cliente
              </a>
            </li>
            <li>
              <a href={links.entrar} className={LINK}>
                Entrar no Connect
              </a>
            </li>
          </ColunaDoRodape>
          <ColunaDoRodape titulo="Contato">
            <li>
              <a href={`mailto:${CONTATO}`} className={`${LINK} break-all`}>
                {CONTATO}
              </a>
            </li>
            <li>
              <a href={links.privacidade} className={LINK}>
                Política de privacidade
              </a>
            </li>
          </ColunaDoRodape>
        </div>
      </footer>
    </div>
  );
}

function ColunaDoRodape({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <nav aria-label={titulo}>
      <p className="font-mono text-fs-2 font-medium uppercase tracking-[0.12em] text-fg-muted">{titulo}</p>
      <ul className="mt-4 flex flex-col gap-2.5 text-fs-4 text-fg-secondary">{children}</ul>
    </nav>
  );
}
