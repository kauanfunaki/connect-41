import { ArrowLeftRight, Eye, ShieldCheck, type LucideIcon } from "lucide-react";
import { Ceci } from "@/components/ia/Ceci";
import { ABERTURA, FAIXA, RESPIRO, TITULO_2 } from "./estilos";
import { CeciNosSetores } from "./CeciNosSetores";
import { AnelDoConnect, Rotulo } from "./Marca";

// A seção da Ceci, o ponto alto do site (13/10/2026, versão 3). Pedido do
// Kauan: "a nossa inteligência artificial, separada por setores e para os
// clientes" — a moeda de barganha do Connect. Num palco escuro (o azul-marinho
// do ponto do meio do logo), a Ceci de verdade (components/ia/Ceci), a lista
// dos setores com uma conversa de exemplo em cada um (CeciNosSetores) e as
// três regras que valem em todos — tiradas da guarda do chat
// (lib/ia/chat/agentes) e do catálogo (lib/ia/catalogo: `escreve: false`).
//
// Nada de "substitui a equipe": ela consulta e sugere, e quem decide é uma
// pessoa. No Portal do Cliente ela ainda não existe, e a lista diz isso.

const REGRAS: { Icone: LucideIcon; titulo: string; texto: string }[] = [
  {
    Icone: Eye,
    titulo: "Vê o que você vê",
    texto: "Ela consulta o Connect com o mesmo acesso de quem pergunta: setor ou tela que a pessoa não abre, ela também não abre.",
  },
  {
    Icone: ShieldCheck,
    titulo: "Não faz nada sozinha",
    texto: "Ela lê e sugere. Uma mudança só acontece quando alguém da equipe confirma.",
  },
  {
    Icone: ArrowLeftRight,
    titulo: "Passa para o setor certo",
    texto: "Pergunta de outro setor vai para a Ceci daquele setor, em vez de virar uma resposta pela metade.",
  },
];

export function SecaoDaCeci() {
  return (
    <section
      id="ceci"
      aria-labelledby="ceci-titulo"
      className="c41-site-escuro relative scroll-mt-16 overflow-hidden text-white"
      style={{ background: "var(--c41-site-palco)" }}
    >
      {/* O brilho azul no alto e o anel do símbolo, grande e apagado, à direita. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_12%_0%,rgba(59,115,237,.38),transparent_70%),radial-gradient(40%_40%_at_100%_100%,rgba(59,115,237,.18),transparent_70%)]" />
        <AnelDoConnect centro={false} className="absolute -right-48 -top-40 size-[680px] text-white/[.045] sm:-right-32" />
      </div>

      <div className={`${FAIXA} ${RESPIRO} relative`}>
        <div className="c41-site-surge flex flex-col gap-8 lg:flex-row lg:items-center lg:gap-14">
          <span className="c41-site-ceci-no-palco relative flex size-[104px] flex-none items-center justify-center sm:size-[128px]">
            <span className="absolute -inset-6 rounded-full bg-[radial-gradient(closest-side,rgba(77,141,255,.42),transparent)]" />
            <Ceci tamanho={128} rotulo="A Ceci, assistente do Connect" className="relative size-full" />
          </span>
          <div className="min-w-0">
            <Rotulo escuro>Conheça a Ceci</Rotulo>
            <h2 id="ceci-titulo" className={`${TITULO_2} mt-4 max-w-[17em] text-white`}>
              A nossa inteligência artificial, em cada setor do escritório
            </h2>
            <p className={`${ABERTURA} mt-5 max-w-[40em] text-white/75`}>
              A Ceci é a assistente do Connect. Em cada setor, ela consulta o que já está no sistema, responde em português comum e
              sugere o próximo passo — que só acontece depois que uma pessoa da equipe confirma.
            </p>
          </div>
        </div>

        <div className="mt-12 sm:mt-16">
          <CeciNosSetores />
        </div>

        <ul className="mt-14 grid gap-8 border-t border-white/10 pt-10 sm:mt-16 sm:grid-cols-3 sm:gap-10">
          {REGRAS.map((r) => (
            <li key={r.titulo} className="c41-site-surge flex flex-col gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/[.08] text-[#C9DAFF] shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)]">
                <r.Icone size={19} strokeWidth={1.8} aria-hidden />
              </span>
              <h3 className="font-display text-fs-7 font-medium leading-tight text-white">{r.titulo}</h3>
              <p className="text-fs-5 leading-relaxed text-white/70">{r.texto}</p>
            </li>
          ))}
        </ul>

        <p className="mt-12 max-w-[52em] text-fs-3 leading-relaxed text-white/60">
          Conversas de exemplo, com dados fictícios. E em qualquer setor, a Ceci da Ajuda explica onde fica cada função do Connect e o
          que dizem os manuais do escritório.
        </p>
      </div>
    </section>
  );
}
