"use client";

import { useId, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  FileClock,
  FileX,
  Funnel,
  GraduationCap,
  HandCoins,
  Hourglass,
  Inbox,
  KeyRound,
  Landmark,
  ListChecks,
  MessageSquareWarning,
  MessagesSquare,
  Minus,
  Pencil,
  Receipt,
  RotateCcw,
  Scale,
  Send,
  ShieldCheck,
  Stethoscope,
  Target,
  Ticket,
  TriangleAlert,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRoundCheck,
  Video,
  type LucideIcon,
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { PainelFlutuante } from "@/components/ui/PainelFlutuante";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { Sparkline } from "@/components/shared/Graficos";
import type { CartaoPronto, IconeDoCartao, OpcaoDoCartao } from "@/lib/home/cartoes";
import type { MetricaDaHome } from "@/lib/home/metricas";
import type { ActionState } from "@/lib/actionState";

// Os quatro cartões coringa do topo do Início (10/11/2026, pedido do Kauan):
// "B · Número com a tendência" (o MetricCard de sempre, com a linha dos
// últimos dias e a variação desde ontem; cor só no que pede atenção) e
// "A · Lápis no cartão" (o lápis abre "Trocar este cartão", com a lista do
// que a pessoa vê, agrupada por setor e com o número de agora).
//
// Os cartões chegam prontos do servidor. A lista do lápis é contada só quando
// a pessoa abre o primeiro lápis (`carregar`), e fica guardada enquanto a
// tela estiver aberta. A troca é otimista: o cartão muda na hora e volta, com
// o aviso do erro, se a gravação falhar. O servidor recarrega o Início depois
// de gravar, e a página remonta este componente com o que ficou valendo.

export type PosicaoDoCartao = {
  cartao: CartaoPronto | null;
  /** A pessoa tem escolha própria nesta posição — mostra "Voltar ao do setor". */
  daPessoa: boolean;
};

type ParaQuem = "pessoa" | "setor";

const ICONES: Record<IconeDoCartao, LucideIcon> = {
  relogio: Clock,
  transferencia: ArrowRightLeft,
  enviada: Send,
  solicitacao: MessageSquareWarning,
  empresa: Building2,
  chamado: Ticket,
  dinheiro: HandCoins,
  calendario: CalendarClock,
  pendencia: Hourglass,
  aprovacao: CheckCheck,
  banco: Landmark,
  alerta: TriangleAlert,
  guia: Receipt,
  chave: KeyRound,
  arquivo: FileX,
  processo: Scale,
  exigencia: ClipboardList,
  licenca: BadgeCheck,
  protocolo: FileClock,
  ferias: CalendarDays,
  admissao: UserPlus,
  rescisao: UserMinus,
  exame: Stethoscope,
  vaga: Briefcase,
  candidato: UserRoundCheck,
  entrevista: Video,
  funil: Funnel,
  certificado: ShieldCheck,
  validacao: ListChecks,
  lead: Target,
  contato: MessagesSquare,
  caixa: Inbox,
  minhas: UserCheck,
  academia: GraduationCap,
};

/** A cor da linha: a do tom quando o número pede atenção; senão, a da marca. */
const COR_DA_LINHA = {
  critico: "var(--c41-danger)",
  atencao: "var(--c41-warning)",
  normal: "var(--c41-brand)",
} as const;

const COR_DA_VARIACAO = {
  bom: "text-success-fg",
  ruim: "text-danger",
  neutro: "text-fg-muted",
} as const;

/** "1º", "2º"… — a posição do cartão, dita na lista quando o indicador já está em outro. */
const ordinal = (i: number) => `${i + 1}º`;

/** Grade de 1, 2 ou 4 colunas: um por linha no celular, dois no tablet, quatro em tela larga. */
const GRADE = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4";

export function FaixaDeCartoes({
  posicoes: iniciais,
  opcoes,
  setorAtivoRotulo,
  podeDefinirDoSetor,
  carregar,
  trocar,
  voltar,
}: {
  /** As quatro posições, na ordem — `cartao` nulo quando a pessoa vê menos de quatro indicadores. */
  posicoes: PosicaoDoCartao[];
  /** As linhas da lista do lápis (o que a pessoa vê), já agrupadas. */
  opcoes: OpcaoDoCartao[];
  /** O nome do setor ativo ("Contábil"); `null` em "Todos os setores". */
  setorAtivoRotulo: string | null;
  /** Coordena o setor ativo: pode gravar o padrão dele. */
  podeDefinirDoSetor: boolean;
  carregar: (chaves?: string[]) => Promise<{ cartoes: CartaoPronto[] } | { error: string }>;
  trocar: (posicao: number, chave: string, para: ParaQuem) => Promise<ActionState>;
  voltar: (posicao: number) => Promise<ActionState>;
}) {
  const [posicoes, setPosicoes] = useState(iniciais);
  const [aberto, setAberto] = useState<number | null>(null);
  const [numeros, setNumeros] = useState<Map<string, CartaoPronto> | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [tentando, setTentando] = useState<number | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();

  const mostrados = posicoes.map((p) => p.cartao?.chave ?? null);

  function carregarOpcoes() {
    if (numeros || carregando) return;
    setCarregando(true);
    setFalhou(false);
    void carregar().then((r) => {
      setCarregando(false);
      if ("error" in r) {
        setFalhou(true);
        return;
      }
      setNumeros(new Map(r.cartoes.map((c) => [c.chave, c])));
    });
  }

  function abrir(i: number) {
    setAberto(i);
    carregarOpcoes();
  }

  function escolher(posicao: number, chave: MetricaDaHome, para: ParaQuem) {
    setAberto(null);
    if (chave === mostrados[posicao]) return;
    const antes = posicoes;
    const opcao = opcoes.find((o) => o.chave === chave);
    if (!opcao) return;
    const pronto: CartaoPronto = numeros?.get(chave) ?? {
      // Sem os números da lista (ainda carregando ou falhou): o cartão entra
      // com o nome e o número chega quando o Início recarregar.
      chave,
      rotulo: opcao.rotulo,
      icone: opcao.icone,
      href: opcao.href,
      numero: { texto: "…", tom: null },
      variacao: null,
      linha: null,
    };
    const outra = mostrados.findIndex((c, i) => c === chave && i !== posicao);
    const novas = posicoes.map((p) => ({ ...p }));
    if (outra >= 0) novas[outra] = { cartao: posicoes[posicao].cartao, daPessoa: para === "pessoa" || novas[outra].daPessoa };
    novas[posicao] = { cartao: pronto, daPessoa: para === "pessoa" };
    setPosicoes(novas);
    startTransition(async () => {
      const r = await trocar(posicao, chave, para);
      if (r?.error) {
        setPosicoes(antes);
        toast.error(r.error);
        return;
      }
      toast.success(para === "setor" ? `Padrão do ${setorAtivoRotulo ?? "setor"} atualizado.` : "Cartão trocado.");
    });
  }

  function voltarAoDoSetor(posicao: number) {
    setAberto(null);
    startTransition(async () => {
      const r = await voltar(posicao);
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      toast.success(setorAtivoRotulo ? `O cartão voltou ao do ${setorAtivoRotulo}.` : "O cartão voltou ao padrão.");
    });
  }

  /** "Tentar de novo" de um cartão cuja consulta falhou: conta só ele. */
  function tentarDeNovo(posicao: number, chave: MetricaDaHome) {
    setTentando(posicao);
    void carregar([chave]).then((r) => {
      setTentando(null);
      const novo = "error" in r ? null : r.cartoes.find((c) => c.chave === chave);
      if (!novo?.numero) {
        toast.error("Ainda não deu para carregar este número.");
        return;
      }
      setPosicoes((atual) => atual.map((p, i) => (i === posicao ? { ...p, cartao: novo } : p)));
    });
  }

  if (posicoes.every((p) => !p.cartao)) return null;

  return (
    <section aria-label="Números do Início" className={GRADE}>
      {posicoes.map((p, i) =>
        p.cartao ? (
          <Cartao
            key={`${i}-${p.cartao.chave}`}
            cartao={p.cartao}
            ordem={i}
            tentando={tentando === i}
            onTentarDeNovo={() => tentarDeNovo(i, p.cartao!.chave)}
            lapis={
              <Lapis
                rotulo={p.cartao.rotulo}
                aberto={aberto === i}
                onAbrir={() => abrir(i)}
                onFechar={() => setAberto(null)}
              >
                <TrocarCartao
                  atual={p.cartao.chave}
                  posicao={i}
                  mostrados={mostrados}
                  opcoes={opcoes}
                  numeros={numeros}
                  carregando={carregando}
                  falhou={falhou}
                  setorAtivoRotulo={setorAtivoRotulo}
                  podeDefinirDoSetor={podeDefinirDoSetor}
                  daPessoa={p.daPessoa}
                  pendente={pendente}
                  onEscolher={(chave, para) => escolher(i, chave, para)}
                  onVoltar={() => voltarAoDoSetor(i)}
                />
              </Lapis>
            }
          />
        ) : null
      )}
    </section>
  );
}

/** O lugar dos cartões enquanto os números chegam: quatro, na altura deles, para a página não pular. */
export function FaixaDeCartoesCarregando() {
  return (
    <div className={GRADE} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[132px] rounded-lg border border-border bg-surface shadow-xs animate-pulse motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function Cartao({
  cartao: c,
  ordem,
  lapis,
  tentando,
  onTentarDeNovo,
}: {
  cartao: CartaoPronto;
  ordem: number;
  lapis: React.ReactNode;
  tentando: boolean;
  onTentarDeNovo: () => void;
}) {
  const Icone = ICONES[c.icone] ?? Clock;

  // A consulta falhou: o cartão fica de pé, sem link, com o aviso e o
  // "Tentar de novo" (07/10: um número que falha não derruba a Home).
  if (!c.numero) {
    return (
      <MetricCard
        label={c.rotulo}
        value="—"
        icon={<Icone />}
        delay={ordem * 40}
        canto={lapis}
        rodape={
          <div className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-micro text-fg-muted">Não deu para carregar.</span>
            <button
              type="button"
              onClick={onTentarDeNovo}
              disabled={tentando}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-micro font-semibold text-brand hover:bg-brand-subtle disabled:opacity-[var(--c41-disabled-op)] [@media(pointer:coarse)]:min-h-11"
            >
              <RotateCcw size={12} aria-hidden /> {tentando ? "Tentando…" : "Tentar de novo"}
            </button>
          </div>
        }
      />
    );
  }

  const { numero, variacao: v, linha } = c;
  const corDaLinha = COR_DA_LINHA[numero.tom ?? "normal"];
  const SetaDaVariacao = v?.direcao === "subiu" ? ArrowUp : v?.direcao === "caiu" ? ArrowDown : Minus;

  return (
    <MetricCard
      href={c.href}
      label={c.rotulo}
      value={numero.texto}
      icon={<Icone />}
      tom={numero.tom ?? undefined}
      detalhe={numero.detalhe}
      delay={ordem * 40}
      canto={lapis}
      // O total da fração ("de 42") vem logo depois do número, e a variação
      // depois dele — com a seta e o texto, não só com a cor. A variação pode
      // encolher (e cortar com a dica) antes do número.
      comparacao={
        numero.apoio || v ? (
          <>
            {numero.apoio && <span className="flex-shrink-0 text-helper text-fg-muted tnum whitespace-nowrap">{numero.apoio}</span>}
            {v && (
              <span
                className={`inline-flex min-w-0 items-center gap-0.5 text-micro font-semibold tnum whitespace-nowrap ${COR_DA_VARIACAO[v.tom]}`}
                data-dica={v.descricao}
              >
                <SetaDaVariacao size={12} className="flex-shrink-0" aria-hidden />
                <span className="truncate" aria-hidden>
                  {v.texto}
                </span>
                <span className="sr-only">{v.descricao}</span>
              </span>
            )}
          </>
        ) : undefined
      }
      rodape={
        <>
          {numero.tom && <span className="sr-only">{numero.tom === "critico" ? "Pede ação: há itens atrasados." : "Pede atenção."}</span>}
          {linha ? (
            <Sparkline pontos={linha} cor={corDaLinha} variante="cartao" className="h-8 w-full" />
          ) : v ? (
            // Com a foto de ontem e sem três dias de linha ainda: o espaço fica, vazio.
            <div className="h-8" aria-hidden />
          ) : (
            <p className="flex h-8 items-end text-micro text-fg-muted">sem histórico ainda</p>
          )}
        </>
      }
    />
  );
}

/**
 * O lápis no canto do cartão: aparece ao passar o mouse e com o foco do
 * teclado; fica sempre à vista em tela de toque (sem "passar o mouse") e no
 * modo Personalizar (`data-editando` no Início). 44px no toque.
 */
function Lapis({
  rotulo,
  aberto,
  onAbrir,
  onFechar,
  children,
}: {
  rotulo: string;
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  const ancora = useRef<HTMLButtonElement>(null);
  const idDoPainel = useId();

  function fechar() {
    onFechar();
    // O foco volta para o lápis, para o teclado seguir de onde estava.
    requestAnimationFrame(() => ancora.current?.focus({ preventScroll: true }));
  }

  return (
    <>
      <button
        ref={ancora}
        type="button"
        onClick={aberto ? fechar : onAbrir}
        aria-label={`Trocar o cartão ${rotulo}`}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idDoPainel : undefined}
        data-dica="Trocar este cartão"
        className="inline-flex size-7 items-center justify-center rounded-md border border-border bg-surface text-fg-muted shadow-xs transition-[opacity,color,background-color] hover:bg-surface-hover hover:text-fg opacity-0 group-hover/cartao:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 group-data-[editando=true]/inicio:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:size-11"
      >
        <Pencil size={13} aria-hidden />
      </button>
      <PainelFlutuante
        ancora={ancora}
        aberto={aberto}
        onFechar={fechar}
        largura={340}
        align="right"
        folhaNoCelular
        id={idDoPainel}
        aria-label={`Trocar o cartão ${rotulo}`}
        className="flex flex-col overflow-hidden"
      >
        {children}
      </PainelFlutuante>
    </>
  );
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * "Trocar este cartão": a busca, a lista agrupada por setor (com o número de
 * agora e o visto no atual) e, embaixo, para quem vale e "Voltar ao do
 * setor". A lista é um `listbox` com o foco na busca: as setas andam, o Enter
 * escolhe e o Esc fecha (o Esc vem da pilha de camadas do `PainelFlutuante`).
 */
function TrocarCartao({
  atual,
  posicao,
  mostrados,
  opcoes,
  numeros,
  carregando,
  falhou,
  setorAtivoRotulo,
  podeDefinirDoSetor,
  daPessoa,
  pendente,
  onEscolher,
  onVoltar,
}: {
  atual: MetricaDaHome;
  posicao: number;
  mostrados: (MetricaDaHome | null)[];
  opcoes: OpcaoDoCartao[];
  numeros: Map<string, CartaoPronto> | null;
  carregando: boolean;
  falhou: boolean;
  setorAtivoRotulo: string | null;
  podeDefinirDoSetor: boolean;
  daPessoa: boolean;
  pendente: boolean;
  onEscolher: (chave: MetricaDaHome, para: ParaQuem) => void;
  onVoltar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [para, setPara] = useState<ParaQuem>("pessoa");
  const idBase = useId();
  const idDaLista = `${idBase}-lista`;

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    if (!q) return opcoes;
    return opcoes.filter((o) => semAcento(o.rotulo).includes(q) || semAcento(o.grupoRotulo).includes(q));
  }, [busca, opcoes]);

  const [ativo, setAtivo] = useState(() => Math.max(0, opcoes.findIndex((o) => o.chave === atual)));
  // A busca muda a lista: o destaque do teclado fica dentro dela.
  const ativoNaLista = Math.min(ativo, Math.max(0, filtradas.length - 1));
  const idDaOpcao = (chave: string) => `${idBase}-${chave}`;

  function noTeclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (filtradas.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const passo = e.key === "ArrowDown" ? 1 : -1;
      const novo = (ativoNaLista + passo + filtradas.length) % filtradas.length;
      setAtivo(novo);
      document.getElementById(idDaOpcao(filtradas[novo].chave))?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setAtivo(e.key === "Home" ? 0 : filtradas.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onEscolher(filtradas[ativoNaLista].chave, para);
    }
  }

  // Os grupos, na ordem que as opções já chegam.
  const grupos: { grupo: string; rotulo: string; itens: { o: OpcaoDoCartao; i: number }[] }[] = [];
  filtradas.forEach((o, i) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.grupo === o.grupo) ultimo.itens.push({ o, i });
    else grupos.push({ grupo: o.grupo, rotulo: o.grupoRotulo, itens: [{ o, i }] });
  });

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border px-3.5 py-3">
        <p className="text-fs-3 font-semibold text-fg">Trocar este cartão</p>
        <CampoDeBusca
          compact
          autoFocus
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setAtivo(0);
          }}
          onKeyDown={noTeclado}
          placeholder="Buscar indicador"
          aria-label="Buscar indicador"
          role="combobox"
          aria-expanded
          aria-controls={idDaLista}
          aria-autocomplete="list"
          aria-activedescendant={filtradas[ativoNaLista] ? idDaOpcao(filtradas[ativoNaLista].chave) : undefined}
        />
      </div>

      <div id={idDaLista} role="listbox" aria-label="Indicadores" className="max-h-[min(340px,50vh)] overflow-y-auto py-1">
        {filtradas.length === 0 && <p className="px-3.5 py-4 text-fs-2 text-fg-muted">Nenhum indicador com esse nome.</p>}
        {grupos.map((g) => (
          <div key={g.grupo} role="group" aria-labelledby={`${idBase}-g-${g.grupo}`}>
            <p id={`${idBase}-g-${g.grupo}`} className="c41-rotulo px-3.5 pt-2.5 pb-1">
              {g.rotulo}
            </p>
            {g.itens.map(({ o, i }) => {
              const eAtual = o.chave === atual;
              const emOutra = mostrados.findIndex((c, j) => c === o.chave && j !== posicao);
              const n = numeros?.get(o.chave);
              return (
                <div
                  key={o.chave}
                  id={idDaOpcao(o.chave)}
                  role="option"
                  aria-selected={eAtual}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => onEscolher(o.chave, para)}
                  className={`flex min-h-9 cursor-pointer items-center gap-2.5 px-3.5 py-1.5 text-fs-3 [@media(pointer:coarse)]:min-h-11 ${
                    i === ativoNaLista ? "bg-surface-hover" : ""
                  } ${eAtual ? "text-brand" : "text-fg"}`}
                >
                  {eAtual ? <Check size={15} className="flex-shrink-0" aria-hidden /> : <span className="w-[15px] flex-shrink-0" aria-hidden />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.rotulo}</span>
                    {emOutra >= 0 && <span className="block text-micro text-fg-muted">no {ordinal(emOutra)} cartão · troca de lugar</span>}
                  </span>
                  <NumeroDaOpcao cartao={n} carregando={carregando} falhou={falhou} />
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-3.5 py-2.5">
        {podeDefinirDoSetor && setorAtivoRotulo ? (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="c41-rotulo">Para quem</span>
            <SegmentedControl
              label="Para quem vale a troca"
              active={para}
              onChange={setPara}
              tocavel
              items={[
                { key: "pessoa", label: "Só para mim" },
                { key: "setor", label: `Padrão do ${setorAtivoRotulo}` },
              ]}
            />
          </div>
        ) : (
          <span className="text-fs-2 text-fg-muted">Vale só para você.</span>
        )}
        {daPessoa && (
          <button
            type="button"
            onClick={onVoltar}
            disabled={pendente}
            className="inline-flex min-h-8 items-center rounded-md px-1.5 text-fs-2 font-semibold text-brand hover:bg-brand-subtle disabled:opacity-[var(--c41-disabled-op)] [@media(pointer:coarse)]:min-h-11"
          >
            {setorAtivoRotulo ? "Voltar ao do setor" : "Voltar ao padrão"}
          </button>
        )}
      </div>
    </>
  );
}

function NumeroDaOpcao({ cartao, carregando, falhou }: { cartao: CartaoPronto | undefined; carregando: boolean; falhou: boolean }) {
  if (cartao?.numero) {
    return (
      <span className="flex-shrink-0 font-display text-fs-2 font-semibold tnum text-fg-secondary">
        {cartao.numero.texto}
        {cartao.numero.apoio ? ` ${cartao.numero.apoio}` : ""}
      </span>
    );
  }
  if (carregando) return <span className="h-3 w-8 flex-shrink-0 rounded bg-surface-hover animate-pulse motion-reduce:animate-none" aria-hidden />;
  // Falhou a lista ou só este número: o travessão, e não um zero que não existe.
  return (
    <span className="flex-shrink-0 text-fs-2 text-fg-muted" aria-label={falhou ? "número indisponível" : undefined}>
      —
    </span>
  );
}
