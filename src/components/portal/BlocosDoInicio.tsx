import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  FileText,
  Megaphone,
  MessageSquarePlus,
  MessagesSquare,
  OctagonAlert,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { Painel, numero } from "@/components/shared/Graficos";
import { aprovacoesDoCliente } from "@/lib/financeiro/aprovacao/portal";
import { pendenciasAguardandoCliente } from "@/lib/financeiro/pendencias/consultas";
import { contasPorJanela, type SomaDeContas } from "@/lib/financeiro/consultas";
import { moeda } from "@/lib/financeiro/formato";
import { solicitacoesAguardandoCliente, solicitacoesComRespostaDaEquipe } from "@/lib/solicitacoes/consultas";
import { comunicadosNaoLidos } from "@/lib/comunicados/consultas";
import { processosAguardandoCliente, processosEmAndamentoDoPortal } from "@/lib/societario/portal-data";
import { SITUACAO_PARA_CLIENTE, VARIANTE_PARA_CLIENTE } from "@/lib/societario/portal";
import { feriadosDoTenant } from "@/lib/societario/fila";
import { contarDocumentos } from "@/lib/fiscal/data";
import type { AlcanceFiscal } from "@/lib/fiscal/alcance";
import { competenciaDoInstante } from "@/lib/financeiro/periodo";
import { saoPauloParts } from "@/lib/agenda";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import {
  comEmpresa,
  janelaDosProximosDias,
  oQuePrecisaDeVoce,
  type BlocosDoInicio,
  type ItemDaAtencao,
} from "@/lib/portal/inicio";

// Os blocos do Início do portal (05/10). Cada um é um server component com a
// própria consulta, montado num <Suspense> pela página — o mesmo desenho dos
// painéis da Home do Connect: a tela aparece sem esperar o bloco mais lento.
//
// Desempenho é a regra da casa aqui: o portal já levou 2 minutos para abrir
// (18/09) por causa de uma contagem. Tudo o que está nesta tela é `count`,
// `groupBy` ou `take` pequeno, pelos índices de tenant e empresa.

/** As empresas que o Início está olhando: todas as do cliente, ou a escolhida. */
type Escopo = { tenantId: string; companyIds: string[] };

/**
 * Um bloco que falha não derruba o Início — é a primeira tela depois do login,
 * e sem ela o cliente não chega a nenhuma outra. O erro fica no log.
 */
async function tentar<T>(bloco: string, consulta: () => Promise<T>): Promise<T | null> {
  try {
    return await consulta();
  } catch (err) {
    console.error(`[Início do portal] ${bloco}`, err);
    return null;
  }
}

function Indisponivel({ texto = "Não deu para carregar agora. Atualize a página em instantes." }: { texto?: string }) {
  return <p className="text-[length:var(--fs-helper)] text-fg-muted py-1.5">{texto}</p>;
}

// ─── O que precisa de você ───────────────────────────────────────────────────

const ICONE_DA_ATENCAO: Record<ItemDaAtencao["chave"], React.ReactNode> = {
  aprovacoes: <ModuleIcon code="bpo_aprovacoes" />,
  pendencias: <ModuleIcon code="bpo_pendencias" />,
  solicitacoesAguardando: <ModuleIcon code="portal_solicitacoes" />,
  processosAguardando: <ModuleIcon code="societario_processos" />,
  solicitacoesRespondidas: <MessagesSquare />,
  comunicados: <Megaphone />,
};

/**
 * O topo do Início: o que espera o cliente, com o número e um botão que leva
 * à tela já no recorte certo. Sem nada esperando, diz isso — aqui o "zero" é
 * a notícia, e não uma faixa a mais (era o contrário no aviso da antiga home,
 * que sumia).
 */
export async function PrecisaDeVoce({
  escopo,
  portalUserId,
  clientGroupId,
  atencao,
}: {
  escopo: Escopo;
  portalUserId: string;
  clientGroupId: string;
  atencao: BlocosDoInicio["atencao"];
}) {
  const agora = new Date();
  const dados = await tentar("o que precisa de você", () =>
    Promise.all([
      atencao.aprovacoes ? aprovacoesDoCliente(escopo, portalUserId) : null,
      atencao.pendencias ? pendenciasAguardandoCliente(escopo) : null,
      atencao.solicitacoes ? solicitacoesAguardandoCliente(escopo) : null,
      atencao.solicitacoes ? solicitacoesComRespostaDaEquipe(escopo, agora) : null,
      atencao.processos ? processosAguardandoCliente(escopo.tenantId, escopo.companyIds) : null,
      // Comunicado vai para o cliente (grupo), não para a empresa: a escolha de empresa não o afeta.
      atencao.comunicados ? comunicadosNaoLidos(escopo.tenantId, clientGroupId, portalUserId) : null,
    ])
  );

  let itens: ItemDaAtencao[] = [];
  if (dados) {
    const [aprovacoes, pendencias, solicitacoesAguardando, solicitacoesRespondidas, processosAguardando, comunicados] = dados;
    // Só as que este cliente pode aprovar (dentro do teto dele) — as outras
    // são acompanhamento, e não "precisa de você".
    const aprovar = aprovacoes?.contas.filter((c) => c.dentroDoTeto) ?? null;
    itens = oQuePrecisaDeVoce(
      {
        aprovacoes: aprovar ? { n: aprovar.length, centavos: aprovar.reduce((s, c) => s + c.valorCentavos, 0) } : null,
        pendencias,
        solicitacoesAguardando,
        solicitacoesRespondidas,
        processosAguardando,
        comunicados,
      },
      moeda
    );
  }
  const temPedido = itens.some((i) => i.tom === "pedido");
  const filete = !dados ? "var(--c41-border)" : temPedido ? "var(--c41-warning)" : itens.length > 0 ? "var(--c41-brand)" : "var(--c41-success)";

  return (
    <section
      aria-labelledby="inicio-precisa-de-voce"
      className="reveal-in relative mb-4 overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--c41-shadow-xs)]"
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: filete }} />
      <h2
        id="inicio-precisa-de-voce"
        className="px-4 sm:px-5 pt-5 pb-3 font-display text-[length:var(--fs-section)] font-semibold text-fg leading-tight"
      >
        O que precisa de você
      </h2>

      {!dados ? (
        <div className="px-4 sm:px-5 pb-4">
          <Indisponivel />
        </div>
      ) : itens.length === 0 ? (
        <div className="flex items-start gap-3 px-4 sm:px-5 pb-5">
          <span className="inline-flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
            <CircleCheck size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-fg">Nada esperando por você</p>
            <p className="mt-0.5 text-[length:var(--fs-helper)] text-fg-secondary leading-relaxed">
              Quando a equipe precisar de algo seu, aparece aqui, e você recebe um aviso por e-mail.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {itens.map((i) => (
            // No celular o botão desce para a linha de baixo e ocupa a largura
            // toda: é o alvo que importa, e ao lado do texto ele espremia a frase.
            <li key={i.chave} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 sm:px-5 py-3.5">
              <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
                <span
                  className={`inline-flex size-9 flex-shrink-0 items-center justify-center rounded-lg [&>svg]:size-[18px] ${
                    i.tom === "pedido" ? "bg-warning/10 text-warning" : "bg-brand-subtle text-brand"
                  }`}
                >
                  {ICONE_DA_ATENCAO[i.chave]}
                </span>
                <p className="min-w-0 text-[length:var(--fs-body)] text-fg leading-snug">
                  <span className="mr-1.5 font-display text-[20px] font-semibold tabular-nums leading-none">{numero(i.quantidade)}</span>
                  {i.texto}
                  {i.detalhe && <span className="mt-0.5 block text-[length:var(--fs-helper)] text-fg-muted tabular-nums">{i.detalhe}</span>}
                </p>
              </div>
              <Button href={i.href} size="sm" variant={i.tom === "pedido" ? "primary" : "secondary"} className="w-full sm:w-auto">
                {i.acao} <ArrowRight size={14} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

type LinhaDoFinanceiro = { chave: string; rotulo: string; soma: SomaDeContas; href: string; vencida: boolean };

function LinhaDeConta({ l }: { l: LinhaDoFinanceiro }) {
  const tem = l.soma.n > 0;
  const icone = !tem ? (
    <CircleCheck size={16} className="text-success" aria-hidden />
  ) : l.vencida ? (
    <OctagonAlert size={16} className="text-danger" aria-hidden />
  ) : (
    <CalendarClock size={16} className="text-warning" aria-hidden />
  );
  return (
    <li>
      <Link
        href={l.href}
        className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-hover"
      >
        <span className="flex-shrink-0">{icone}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-fg">{l.rotulo}</span>
          <span className="block text-[length:var(--fs-micro)] text-fg-muted">
            {tem ? `${numero(l.soma.n)} ${l.soma.n === 1 ? "conta" : "contas"}` : "Nenhuma"}
          </span>
        </span>
        <span
          className={`whitespace-nowrap text-[15px] font-semibold tabular-nums ${tem && l.vencida ? "text-danger" : tem ? "text-fg" : "text-fg-muted"}`}
        >
          {moeda(l.soma.centavos)}
        </span>
      </Link>
    </li>
  );
}

/**
 * As contas das empresas do cliente: a pagar vencidas e as que vencem nesta
 * semana, e o a receber em atraso — cada número só se a tela dele está no
 * menu. Os atalhos levam às telas do financeiro que o cliente tem.
 */
export async function FinanceiroDoInicio({
  escopo,
  financeiro,
  empresaId,
}: {
  escopo: Escopo;
  financeiro: NonNullable<BlocosDoInicio["financeiro"]>;
  /** A empresa escolhida no Início, levada adiante para as telas que aceitam. */
  empresaId: string | null;
}) {
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const janela = janelaDosProximosDias(hojeKey);
  const temNumeros = financeiro.pagar || financeiro.receberEmAtraso !== null;
  const contas = temNumeros ? await tentar("financeiro", () => contasPorJanela(escopo, hojeKey, janela.depoisKey)) : null;
  // A data dita, e não "próximos 7 dias": o cliente não precisa contar.
  const ate = formatCalendarDate(new Date(`${janela.fimKey}T12:00:00Z`), { day: "2-digit", month: "2-digit" });

  const linhas: LinhaDoFinanceiro[] = [];
  if (contas && financeiro.pagar) {
    linhas.push(
      { chave: "pagar-vencidas", rotulo: "A pagar vencidas", soma: contas.PAGAR.vencidas, href: "/portal/pagar", vencida: true },
      { chave: "pagar-proximas", rotulo: `A pagar de hoje até ${ate}`, soma: contas.PAGAR.proximas, href: "/portal/pagar", vencida: false }
    );
  }
  if (contas && financeiro.receberEmAtraso) {
    linhas.push({
      chave: "receber-atraso",
      rotulo: "A receber em atraso",
      soma: contas.RECEBER.vencidas,
      href: financeiro.receberEmAtraso,
      vencida: true,
    });
  }

  const titulo = financeiro.pagar
    ? financeiro.receberEmAtraso
      ? "Contas a pagar e a receber"
      : "Contas a pagar"
    : financeiro.receberEmAtraso
      ? "Contas a receber"
      : "Caixa e resultado";

  return (
    <Painel
      setor="Financeiro"
      titulo={titulo}
      rodape={
        financeiro.atalhos.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {financeiro.atalhos.map((a) => (
              <Button key={a.href} href={comEmpresa(a.href, empresaId)} variant="secondary" size="sm">
                {a.rotulo}
              </Button>
            ))}
          </div>
        ) : undefined
      }
    >
      {!temNumeros ? (
        <p className="text-[length:var(--fs-helper)] text-fg-secondary leading-relaxed">
          O que entrou e saiu, o que vence daqui para frente e o resultado de cada mês das suas empresas.
        </p>
      ) : !contas ? (
        <Indisponivel />
      ) : (
        <ul className="space-y-2">
          {linhas.map((l) => (
            <LinhaDeConta key={l.chave} l={l} />
          ))}
        </ul>
      )}
    </Painel>
  );
}

// ─── Societário ──────────────────────────────────────────────────────────────

/** Quantos processos estão em andamento e os três mais recentes, com a situação. */
export async function ProcessosDoInicio({ escopo, variasEmpresas }: { escopo: Escopo; variasEmpresas: boolean }) {
  const dados = await tentar("processos", async () => {
    const feriados = await feriadosDoTenant(escopo.tenantId);
    return processosEmAndamentoDoPortal(escopo.tenantId, escopo.companyIds, new Date(), feriados);
  });

  return (
    <Painel
      setor="Societário"
      titulo="Processos em andamento"
      destaque={dados && dados.total > 0 ? { valor: numero(dados.total), legenda: "em andamento" } : undefined}
      rodape={
        <Button href="/portal/processos" variant="secondary" size="sm">
          Ver todos os processos
        </Button>
      }
    >
      {!dados ? (
        <Indisponivel />
      ) : dados.recentes.length === 0 ? (
        <p className="text-[length:var(--fs-helper)] text-fg-secondary leading-relaxed">
          Nenhum processo em andamento agora. Quando a equipe abrir um para a sua empresa, ele aparece aqui com a situação.
        </p>
      ) : (
        <ul className="space-y-2">
          {dados.recentes.map((p) => {
            const apoio = [p.titulo ? p.tipoNome : null, variasEmpresas ? p.empresaNome : null].filter(Boolean).join(" · ");
            return (
              <li key={p.id}>
                <Link
                  href={`/portal/processos/${p.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-border-strong hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate text-[13px] font-medium text-fg">{p.titulo || p.tipoNome}</span>
                    <span className="block truncate text-[length:var(--fs-micro)] text-fg-muted">
                      {apoio || `aberto em ${formatInstantDate(p.iniciadoEm)}`}
                    </span>
                  </span>
                  <Badge variant={VARIANTE_PARA_CLIENTE[p.situacao]}>{SITUACAO_PARA_CLIENTE[p.situacao].rotulo}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Painel>
  );
}

// ─── Atalhos ─────────────────────────────────────────────────────────────────

function Atalho({ href, icone, titulo, descricao }: { href: string; icone: React.ReactNode; titulo: string; descricao: React.ReactNode }) {
  return (
    <li className="min-w-0">
      <Link
        href={href}
        className="group flex h-full items-center gap-3 rounded-lg border border-border bg-surface p-4 shadow-[var(--c41-shadow-xs)] transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[var(--c41-shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <span className="inline-flex size-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand [&>svg]:size-[18px]">
          {icone}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-fg">{titulo}</span>
          <span className="block text-[length:var(--fs-helper)] text-fg-muted leading-snug">{descricao}</span>
        </span>
        <ChevronRight size={16} className="flex-shrink-0 text-fg-muted transition-colors group-hover:text-fg" aria-hidden />
      </Link>
    </li>
  );
}

/**
 * Pedir algo, os documentos fiscais e a ajuda. A contagem dos documentos chega
 * por `documentos`, já dentro de um <Suspense>: o atalho aparece na hora.
 */
export function AtalhosDoInicio({
  pedir,
  documentos,
  empresaId,
}: {
  pedir: BlocosDoInicio["pedir"];
  documentos: React.ReactNode;
  empresaId: string | null;
}) {
  return (
    <section aria-labelledby="inicio-atalhos" className="mb-4">
      <h2 id="inicio-atalhos" className="mb-3 font-display text-[length:var(--fs-section)] font-semibold text-fg leading-tight">
        Atalhos
      </h2>
      <ul className={`grid grid-cols-1 gap-3 ${pedir ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        {pedir && (
          <Atalho
            href={pedir.href}
            icone={<MessageSquarePlus />}
            titulo={pedir.rotulo}
            descricao="Documento, alteração ou dúvida: a equipe responde por aqui."
          />
        )}
        <Atalho href={comEmpresa("/portal/documentos", empresaId)} icone={<FileText />} titulo="Ver documentos fiscais" descricao={documentos} />
        <Atalho href="/portal/ajuda" icone={<CircleHelp />} titulo="Ajuda" descricao="Como fazer cada coisa no portal, passo a passo." />
      </ul>
    </section>
  );
}

export const DESCRICAO_DOS_DOCUMENTOS = "Notas emitidas e recebidas pelas suas empresas.";

/**
 * Quantas notas há no mês corrente, com o teto da lista — e nada além disso.
 * Um número barato de propósito: foi a contagem do acervo que travou o portal
 * em 18/09.
 */
export async function ContagemDosDocumentos({ alcance }: { alcance: AlcanceFiscal }) {
  const agora = new Date();
  const c = await tentar("documentos", () => contarDocumentos(alcance, { competencia: competenciaDoInstante(agora) }));
  if (!c) return <>{DESCRICAO_DOS_DOCUMENTOS}</>;
  const mes = formatInstantDate(agora, { month: "long" });
  if (c.total === 0) return <>Nenhuma nota em {mes} até agora.</>;
  if (c.limitado) return <>Mais de {numero(c.total)} notas em {mes}.</>;
  return (
    <>
      {numero(c.total)} {c.total === 1 ? "nota" : "notas"} em {mes}.
    </>
  );
}

/** O lugar do bloco enquanto a consulta dele roda. `className` leva o respiro de quem o usa. */
export function BlocoCarregando({ baixo = false, className = "" }: { baixo?: boolean; className?: string }) {
  return (
    <div
      className={`min-w-0 rounded-lg border border-border bg-surface p-5 shadow-[var(--c41-shadow-xs)] ${baixo ? "min-h-[120px]" : "min-h-[220px]"} ${className}`.trim()}
      aria-hidden
    >
      <div className="h-2.5 w-20 animate-pulse rounded-full bg-surface-hover" />
      <div className="mt-2.5 h-4 w-44 animate-pulse rounded-full bg-surface-hover" />
      <div className="mt-6 h-2.5 w-full animate-pulse rounded-full bg-surface-hover" />
      <div className="mt-3 h-2.5 w-4/5 animate-pulse rounded-full bg-surface-hover" />
    </div>
  );
}
