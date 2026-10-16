import { Blocks, Building2, Check, LockKeyhole, Mail, ScrollText, Users } from "lucide-react";
import { formatarReais } from "@/lib/format";
import type { PlanoDoSite, PlanosDoSite, SetorDoSite } from "@/lib/planos/site-regras";
import { CONTATO } from "@/lib/site/textos";
import { EscolhaDosSetores } from "./EscolhaDosSetores";
import { ABERTURA, BOTAO_GRANDE, CARTAO, FAIXA, PRIMARIO, RESPIRO, TITULO_2, corDoSetor } from "./estilos";
import { AnelDoConnect, Rotulo } from "./Marca";

// A seção "Planos" do site (14/10/2026, escolha A do Kauan: "dois cartões"),
// entre O Connect e Segurança (subiu na página no mesmo dia, para ganhar
// destaque), com o link "Planos" no topo.
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
//
// Depois dos planos, o cartão "Connect sob medida" (pedido do Kauan, 14/10):
// para quem quer contratar só um ou dois setores, os que quiser. Não é um
// plano — borda tracejada e fundo da página, em vez do cartão cheio —, nunca
// tem preço (nem com o interruptor ligado) e o "Montar meu plano" leva os
// setores escolhidos no e-mail. O Super Admin esconde o cartão em Planos.

/** Quantos setores aparecem como etiqueta; o resto vira "+N setores". */
const SETORES_VISIVEIS = 6;

const EM_TODOS = [
  { Icone: LockKeyhole, texto: "Permissões por setor" },
  { Icone: ScrollText, texto: "Registro de quem fez o quê" },
  { Icone: Building2, texto: "Cada escritório com os seus dados" },
];

/** Reais sem o espaço duro do `Intl` ("R$ 1.200,00"): o site não usa espaço duro (ver o teste). */
const reais = (v: number) => formatarReais(v).replace(/ /g, " ");

/**
 * As colunas da lista de cartões, pelo total (os planos e o sob medida): um
 * cartão só fica estreito no meio; dois e quatro, duas colunas; três ou mais,
 * duas no tablet e três no computador. O cartão "Connect sob medida", que é o
 * último, completa a linha que sobrar — "dois + um" no tablet, com ele
 * ocupando a linha de baixo inteira, em vez de ficar sozinho pela metade.
 */
export function gradeDosCartoes(planos: number, comSobMedida: boolean): { lista: string; sobMedida: string } {
  const total = planos + (comSobMedida ? 1 : 0);
  if (total <= 1) return { lista: "md:max-w-[40rem]", sobMedida: "" };
  if (total === 2 || total === 4) return { lista: "md:grid-cols-2", sobMedida: "" };
  const noTablet = total % 2 === 1 ? "md:col-span-2" : "";
  const noComputador = ["lg:col-span-1", "lg:col-span-3", "lg:col-span-2"][total % 3];
  return { lista: "md:grid-cols-2 lg:grid-cols-3", sobMedida: `${noTablet} ${noComputador}`.trim() };
}

export function SecaoDePlanos({ planos }: { planos: PlanosDoSite }) {
  const modos = new Set(planos.planos.map((p) => p.modo));
  const doisJeitos = modos.has("MANAGED") && modos.has("SELF_SERVICE");
  const grade = gradeDosCartoes(planos.planos.length, Boolean(planos.sobMedida));
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

        <ul className={`mt-10 grid gap-4 sm:mt-12 lg:gap-5 ${grade.lista}`}>
          {planos.planos.map((p) => (
            <CartaoDoPlano key={p.id} plano={p} />
          ))}
          {planos.sobMedida && <CartaoSobMedida setores={planos.sobMedida.setores} className={grade.sobMedida} />}
        </ul>

        {/* O que vale para todos (retorno do Kauan, 14/10: a faixa esticada na
            largura toda deixava buracos desiguais entre os itens). Agora ela tem
            o tamanho do conteúdo, no meio: no computador grande, o rótulo e os
            três itens numa linha, com um fio entre eles e o mesmo espaço dos
            dois lados de cada fio; no tablet, o rótulo em cima e os itens
            embaixo, quebrando pelo meio; no celular, um embaixo do outro. */}
        <div className="c41-site-surge mt-8 flex justify-center sm:mt-10">
          <div className="flex w-full flex-col gap-3 rounded-[22px] border border-border px-5 py-4 sm:w-auto sm:items-center sm:px-7 xl:flex-row xl:gap-0 xl:rounded-full xl:py-3.5">
            <p className="font-mono text-fs-2 font-medium uppercase tracking-[0.12em] text-fg-muted xl:border-r xl:border-border xl:pr-6">
              Em todos
            </p>
            <ul className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2.5 xl:flex-nowrap xl:gap-0 xl:divide-x xl:divide-border">
              {EM_TODOS.map(({ Icone, texto }) => (
                <li key={texto} className="inline-flex items-center gap-2 text-fs-4 font-medium text-fg sm:whitespace-nowrap xl:px-6 xl:last:pr-0">
                  <Icone size={16} aria-hidden className="flex-none text-brand" />
                  {texto}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const SOB_MEDIDA_DESTAQUES = [
  "Comece com um setor e acrescente outros quando quiser",
  "Valor montado conforme os módulos escolhidos",
  "Mesma segurança e suporte dos outros planos",
];

/**
 * O cartão "Connect sob medida": o mesmo esqueleto dos planos (ícone, nome,
 * para quem é, destaques, o lugar do preço, as etiquetas e o botão no pé), na
 * borda tracejada. As etiquetas e o botão são a parte de cliente
 * (EscolhaDosSetores); o resto sai pronto do servidor.
 */
function CartaoSobMedida({ setores, className }: { setores: SetorDoSite[]; className: string }) {
  return (
    <li
      data-cartao="sob-medida"
      className={`c41-site-surge relative flex flex-col gap-5 overflow-hidden rounded-[22px] border border-dashed border-border-strong bg-[var(--c41-site-fundo)] p-6 sm:p-7 lg:p-8 ${className}`.trim()}
    >
      <span className="relative flex size-12 flex-none items-center justify-center rounded-[12px] border border-dashed border-brand/40 text-brand">
        <Blocks size={22} strokeWidth={1.8} aria-hidden />
      </span>

      <div className="relative flex flex-col gap-2">
        <h3 className="font-display text-fs-8 font-medium leading-tight tracking-[-0.01em] text-fg sm:text-[1.75rem]">Connect sob medida</h3>
        <p className="text-fs-5 leading-normal text-fg-secondary">
          Para quem quer começar por um ou dois setores, os que você quiser. Você escolhe os módulos, e a gente monta o valor do seu jeito.
        </p>
      </div>

      <ul className="relative flex flex-col gap-2">
        {SOB_MEDIDA_DESTAQUES.map((d) => (
          <li key={d} className="flex items-start gap-2 text-fs-4 text-fg">
            <Check size={16} aria-hidden className="mt-0.5 flex-none text-brand" />
            {d}
          </li>
        ))}
      </ul>

      {/* O lugar do preço, sem preço nunca: o valor sai dos módulos escolhidos. */}
      <p className="relative text-fs-5 font-medium text-fg-secondary">Valor conforme os módulos</p>

      <EscolhaDosSetores setores={setores} contato={CONTATO} />
    </li>
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
