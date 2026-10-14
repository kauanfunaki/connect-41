import { Building2, Check, LockKeyhole, Mail, ScrollText, Users } from "lucide-react";
import { formatarReais } from "@/lib/format";
import type { PlanoDoSite, PlanosDoSite } from "@/lib/planos/site-regras";
import { CONTATO } from "@/lib/site/textos";
import { ABERTURA, BOTAO_GRANDE, CARTAO, FAIXA, PRIMARIO, RESPIRO, TITULO_2 } from "./estilos";
import { AnelDoConnect, Rotulo } from "./Marca";

// A seção "Planos" do site (14/10/2026, escolha A do Kauan: "dois cartões"),
// entre Segurança e Sobre nós, com o link "Planos" no topo.
//
// Os cartões vêm do cadastro de Planos (Administração › Planos): só os planos
// ativos marcados "Mostrar no site", na ordem escolhida lá — a leitura e as
// regras estão em lib/planos/site. O desenho é o das portas "Sou cliente /
// Sou da equipe": o ícone do modo, o nome, para quem é, os setores que o plano
// inclui e "Fale com a gente" (o e-mail de contato do site, com o nome do plano
// no assunto). Embaixo, o que vale para todos.
//
// Decisão do Kauan (14/10): sem preço por enquanto. O lugar do preço é o
// "Valor sob consulta"; com o interruptor "Mostrar preços no site" ligado, o
// valor e a implantação entram ali, sem mexer no resto. Desligado, o preço
// nem chega a este componente.

/** Quantos setores aparecem como etiqueta; o resto vira "+N setores". */
const SETORES_VISIVEIS = 6;

const EM_TODOS = [
  { Icone: LockKeyhole, texto: "Permissões por setor" },
  { Icone: ScrollText, texto: "Registro de quem fez o quê" },
  { Icone: Building2, texto: "Cada escritório com os seus dados" },
];

/** Reais sem o espaço duro do `Intl` ("R$ 1.200,00"): o site não usa espaço duro (ver o teste). */
const reais = (v: number) => formatarReais(v).replace(/ /g, " ");

/** A cor do setor no tema do site; sem a variável, a cor do cadastro. */
function corDoSetor(code: string, cor: string): string {
  return `var(--c41-sector-${code === "dp" ? "dprh" : code}, ${cor})`;
}

const COLUNAS: Record<number, string> = { 1: "md:max-w-[40rem]", 2: "md:grid-cols-2", 3: "md:grid-cols-2 lg:grid-cols-3" };

export function SecaoDePlanos({ planos }: { planos: PlanosDoSite }) {
  const modos = new Set(planos.planos.map((p) => p.modo));
  const doisJeitos = modos.has("MANAGED") && modos.has("SELF_SERVICE");
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="scroll-mt-16">
      <div className={`${FAIXA} ${RESPIRO}`}>
        <div className="c41-site-surge max-w-[46em]">
          <Rotulo>Planos</Rotulo>
          <h2 id="planos-titulo" className={`${TITULO_2} mt-4 text-fg`}>
            {doisJeitos ? "Quem cuida do Connect: a 41 Tech ou a sua equipe" : "Os planos do Connect"}
          </h2>
          <p className={`${ABERTURA} mt-5 text-fg-secondary`}>
            {doisJeitos
              ? "Escolha quem administra usuários, setores e módulos no dia a dia. A gente conversa e monta o plano do seu escritório."
              : "A gente conversa e monta o plano do seu escritório."}
          </p>
        </div>

        <ul className={`mt-10 grid gap-4 sm:mt-12 lg:gap-5 ${COLUNAS[planos.planos.length] ?? COLUNAS[3]}`}>
          {planos.planos.map((p) => (
            <CartaoDoPlano key={p.id} plano={p} />
          ))}
        </ul>

        <div className="c41-site-surge mt-6 grid gap-4 rounded-[22px] border border-border px-5 py-5 sm:mt-7 sm:grid-cols-[auto_repeat(3,minmax(0,1fr))] sm:items-center sm:gap-6 sm:px-6">
          <p className="font-mono text-fs-2 font-medium uppercase tracking-[0.12em] text-fg-muted">Em todos</p>
          {EM_TODOS.map(({ Icone, texto }) => (
            <p key={texto} className="inline-flex items-center gap-2.5 text-fs-4 font-medium text-fg">
              <Icone size={17} aria-hidden className="flex-none text-brand" />
              {texto}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function CartaoDoPlano({ plano }: { plano: PlanoDoSite }) {
  const Icone = plano.modo === "MANAGED" ? Building2 : Users;
  const visiveis = plano.setores.slice(0, SETORES_VISIVEIS);
  const resto = plano.setores.length - visiveis.length;
  const assunto = encodeURIComponent(`Plano ${plano.nome}`);
  return (
    <li
      className={`c41-site-surge ${CARTAO} relative flex flex-col gap-5 overflow-hidden p-6 sm:p-7 lg:p-8 ${
        plano.destacar ? "border-brand shadow-[0_0_0_1px_var(--c41-brand)]" : ""
      }`}
    >
      <AnelDoConnect
        centro={false}
        className={`pointer-events-none absolute -right-10 -top-10 size-36 text-brand ${plano.destacar ? "opacity-[.14]" : "opacity-[.07]"}`}
      />
      <span className="relative flex size-12 flex-none items-center justify-center rounded-[12px] bg-brand-subtle text-brand">
        <Icone size={22} strokeWidth={1.8} aria-hidden />
      </span>

      <div className="relative flex flex-col gap-2">
        <h3 className="font-display text-fs-8 font-medium leading-tight tracking-[-0.01em] text-fg sm:text-[1.75rem]">{plano.nome}</h3>
        <p className="text-fs-5 leading-normal text-fg-secondary">{plano.paraQuem}</p>
      </div>

      {plano.destaques.length > 0 && (
        <ul className="relative flex flex-col gap-2">
          {plano.destaques.map((d) => (
            <li key={d} className="flex items-start gap-2 text-fs-4 text-fg">
              <Check size={16} aria-hidden className="mt-0.5 flex-none text-brand" />
              {d}
            </li>
          ))}
        </ul>
      )}

      {/* O lugar do preço: "Valor sob consulta" enquanto os preços estiverem escondidos. */}
      <div className="relative">
        {plano.preco ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-fs-9 font-medium tnum text-fg">{reais(plano.preco.valor)}</span>
              <span className="text-fs-4 text-fg-secondary">
                {plano.preco.cobranca === "PER_USER_MONTHLY" ? "por usuário/mês" : "por mês, valor fixo"}
              </span>
            </p>
            {plano.preco.implantacao > 0 && (
              <p className="mt-1 text-fs-4 text-fg-muted">{`+ implantação de ${reais(plano.preco.implantacao)}`}</p>
            )}
          </>
        ) : (
          <p className="text-fs-5 font-medium text-fg-secondary">Valor sob consulta</p>
        )}
      </div>

      {plano.setores.length > 0 && (
        <div className="relative">
          <p className="font-mono text-fs-1 font-medium uppercase tracking-[0.12em] text-fg-muted">O que inclui</p>
          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {visiveis.map((s) => (
              <li
                key={s.code}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-fs-3 font-medium text-fg"
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: corDoSetor(s.code, s.cor) }} />
                {s.rotulo}
              </li>
            ))}
            {resto > 0 && (
              <li className="inline-flex items-center rounded-full border border-border px-2.5 py-1 text-fs-3 font-medium text-fg-secondary">
                {`+${resto} ${resto === 1 ? "setor" : "setores"}`}
              </li>
            )}
          </ul>
        </div>
      )}

      <a href={`mailto:${CONTATO}?subject=${assunto}`} className={`${BOTAO_GRANDE} ${PRIMARIO} relative mt-auto self-start`}>
        <Mail size={18} aria-hidden className="flex-none" />
        Fale com a gente
      </a>
    </li>
  );
}
