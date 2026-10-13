import { CalendarDays, ListChecks, Lock, MessageSquareText, SendHorizontal, SlidersHorizontal, X } from "lucide-react";
import { Ligia } from "@/components/ia/Ligia";

// A tela do Connect que sobe por baixo do título, na primeira dobra (13/10/2026,
// versão 3 do site): as contas a pagar do BPO com a Lígia abrindo o chat do
// canto, como no Connect de verdade — o "Oi, Camila! Eu sou a Lígia." e o
// aviso de que ela não altera nada sozinha são os do chat
// (components/shell/ChatDeIA), e as três perguntas são as sugestões do agente
// do BPO (lib/ia/chat/agentes). Empresas, valores e nomes são inventados, os
// mesmos das telas de exemplo do login e do portal, na mesma semana (19 a
// 23/10/2026, "hoje" é 20/10).
//
// Desenhada em código, nos tokens do app, para acompanhar o tema. Inteira só
// no computador; no tablet some o menu da lateral, e no celular fica só o
// painel do chat — a tabela não cabe, e a Lígia é o assunto.
//
// Decorativa (aria-hidden): quem usa leitor de tela tem a seção da Lígia,
// logo abaixo, com o texto de verdade. A legenda embaixo diz que é exemplo.

const SETORES: { nome: string; cor: string; ativo?: true }[] = [
  { nome: "BPO Financeiro", cor: "var(--c41-sector-bpo)", ativo: true },
  { nome: "Fiscal", cor: "var(--c41-sector-fiscal)" },
  { nome: "Departamento Pessoal", cor: "var(--c41-sector-dprh)" },
  { nome: "Societário", cor: "var(--c41-sector-societario)" },
  { nome: "Recrutamento", cor: "var(--c41-sector-recrutamento)" },
];

const TOTAIS = [
  { rotulo: "Vencido", valor: "R$ 2.180,00", tom: "text-danger" },
  { rotulo: "Vence hoje", valor: "R$ 6.452,00", tom: "text-warning-fg" },
  { rotulo: "Pago no mês", valor: "R$ 91.700,00", tom: "text-success-fg" },
];

type Situacao = "hoje" | "aprovacao" | "vencida" | "aprovada";
const SELO: Record<Situacao, { texto: string; classe: string }> = {
  hoje: { texto: "Vence hoje", classe: "bg-warning-bg text-warning-fg" },
  aprovacao: { texto: "Aguardando aprovação", classe: "bg-brand-subtle text-brand" },
  vencida: { texto: "Vencida", classe: "bg-danger-bg text-danger" },
  aprovada: { texto: "Aprovada", classe: "bg-success-bg text-success-fg" },
};

const CONTAS: { fornecedor: string; empresa: string; vencimento: string; valor: string; situacao: Situacao }[] = [
  { fornecedor: "Companhia de Energia", empresa: "Padaria Bom Grão", vencimento: "20/10", valor: "R$ 1.284,90", situacao: "hoje" },
  { fornecedor: "Imobiliária Central", empresa: "Transportes Modelo", vencimento: "20/10", valor: "R$ 7.800,00", situacao: "aprovacao" },
  { fornecedor: "Gás Rápido Distribuidora", empresa: "Padaria Bom Grão", vencimento: "16/10", valor: "R$ 640,00", situacao: "vencida" },
  { fornecedor: "Distribuidora Trigo Fino", empresa: "Padaria Bom Grão", vencimento: "14/10", valor: "R$ 1.094,90", situacao: "vencida" },
  { fornecedor: "Oficina do Paulo", empresa: "Transportes Modelo", vencimento: "22/10", valor: "R$ 1.560,00", situacao: "aprovada" },
];

// As colunas da tabela: o vencimento só aparece na tela larga — abaixo de
// 1280 px a página do meio fica estreita entre a lateral e o chat.
const COLUNAS = "grid grid-cols-[minmax(0,1fr)_84px_124px] gap-3 xl:grid-cols-[minmax(0,1fr)_56px_92px_128px]";

// As sugestões do agente do BPO no chat (CONFIGS, em lib/ia/chat/agentes).
const SUGESTOES = [
  "O que está vencido nas contas a pagar?",
  "Quais pendências estão esperando o cliente?",
  "Quais contas estão aguardando aprovação?",
];

export function TelaDoConnect() {
  return (
    <div
      aria-hidden
      className="select-none rounded-[26px] bg-white/45 p-1.5 shadow-[0_60px_120px_-50px_rgba(15,26,51,.55)] ring-1 ring-inset ring-white/70 backdrop-blur-xl dark:bg-white/[.04] dark:shadow-[0_60px_120px_-40px_rgba(0,0,0,.8)] dark:ring-white/10 sm:rounded-[30px] sm:p-2.5"
    >
      <div className="overflow-hidden rounded-[20px] border border-border bg-surface text-left text-fg dark:bg-canvas sm:rounded-[22px]">
        {/* A barra do navegador, com o endereço do Connect. */}
        <div className="flex h-10 items-center gap-3 border-b border-border bg-surface px-3.5 dark:bg-sidebar-bg sm:h-11">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
            <span className="size-2.5 rounded-full bg-border-strong" />
          </span>
          <span className="mx-auto inline-flex min-w-0 items-center gap-1.5 rounded-md bg-canvas px-3 py-1 font-mono text-[11px] text-fg-muted dark:bg-surface">
            <Lock size={11} className="flex-none" />
            <span className="truncate">app.useconnect.com.br/pagar</span>
          </span>
          <span className="w-[42px]" />
        </div>

        <div className="grid md:h-[520px] md:grid-cols-[minmax(0,1fr)_280px] lg:grid-cols-[168px_minmax(0,1fr)_300px] xl:grid-cols-[196px_minmax(0,1fr)_336px]">
          {/* A lateral do Connect, com a cor de cada setor. */}
          <div className="hidden flex-col gap-1 border-r border-border bg-sidebar-bg px-3 py-4 lg:flex">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-light.svg" alt="" className="mb-4 ml-1.5 h-[18px] w-auto self-start dark:hidden" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-horizontal-dark.svg" alt="" className="mb-4 ml-1.5 hidden h-[18px] w-auto self-start dark:block" />
            <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-fg-secondary">
              <ListChecks size={14} className="flex-none text-fg-muted" />
              Meu dia
            </span>
            <span className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] text-fg-secondary">
              <CalendarDays size={14} className="flex-none text-fg-muted" />
              Agenda
            </span>
            <span className="mb-1 mt-4 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">Setores</span>
            {SETORES.map((s) => (
              <span
                key={s.nome}
                className={`relative flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] ${
                  s.ativo ? "bg-brand-subtle font-semibold text-fg" : "text-fg-secondary"
                }`}
              >
                {s.ativo && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full" style={{ background: s.cor }} />}
                <span className="size-2.5 flex-none rounded-[3px]" style={{ background: s.cor }} />
                <span className="truncate">{s.nome}</span>
              </span>
            ))}
            <span className="mt-auto flex items-center gap-2 px-1.5">
              <span className="flex size-7 flex-none items-center justify-center rounded-full bg-brand-subtle text-[10.5px] font-semibold text-brand">
                CS
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[12px] font-semibold text-fg">Camila Souza</span>
                <span className="block truncate text-[10.5px] text-fg-muted">BPO Financeiro</span>
              </span>
            </span>
          </div>

          {/* A página: contas a pagar. Fora no celular. */}
          <div className="hidden min-w-0 flex-col gap-4 bg-canvas px-5 py-5 dark:bg-canvas md:flex lg:px-6">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">
                  <span className="size-2 rounded-full bg-sector-bpo" />
                  BPO Financeiro
                </p>
                <p className="mt-1 font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-fg">Contas a pagar</p>
              </div>
              <span className="flex flex-none gap-1.5">
                <span className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-[11.5px] font-medium text-fg-secondary">
                  <SlidersHorizontal size={12} className="flex-none" />
                  Filtros
                </span>
                <span className="inline-flex h-7 items-center rounded-md bg-brand-solid px-2.5 text-[11.5px] font-semibold text-on-brand">Nova conta</span>
              </span>
            </div>

            {/* A faixa de totais: o primeiro cheio de azul, como no Connect. */}
            <div className="grid grid-cols-2 gap-2">
              <span
                className="flex flex-col gap-0.5 rounded-lg px-3 py-2.5 text-white"
                style={{ background: "linear-gradient(135deg, var(--c41-destaque-numero-de), var(--c41-destaque-numero-ate))" }}
              >
                <span className="text-[10.5px] text-white/90">Em aberto</span>
                <span className="text-[15px] font-semibold tabular-nums tracking-[-0.01em]">R$ 48.320,00</span>
              </span>
              {TOTAIS.map((t) => (
                <span key={t.rotulo} className="flex flex-col gap-0.5 rounded-lg border border-border bg-surface px-3 py-2.5">
                  <span className="text-[10.5px] text-fg-muted">{t.rotulo}</span>
                  <span className={`text-[15px] font-semibold tabular-nums tracking-[-0.01em] ${t.tom}`}>{t.valor}</span>
                </span>
              ))}
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className={`${COLUNAS} border-b border-border px-3.5 py-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-fg-muted`}>
                <span>Fornecedor</span>
                <span className="hidden xl:block">Vence</span>
                <span className="text-right">Valor</span>
                <span>Situação</span>
              </div>
              {CONTAS.map((c) => (
                <div
                  key={c.fornecedor}
                  className={`${COLUNAS} items-center border-b border-border px-3.5 py-2 last:border-b-0`}
                >
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[12px] font-semibold text-fg">{c.fornecedor}</span>
                    <span className="block truncate text-[10.5px] text-fg-muted">{c.empresa}</span>
                  </span>
                  <span className="hidden text-[11.5px] tabular-nums text-fg-secondary xl:block">{c.vencimento}</span>
                  <span className="text-right text-[12px] font-semibold tabular-nums text-fg">{c.valor}</span>
                  <span>
                    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${SELO[c.situacao].classe}`}>
                      {SELO[c.situacao].texto}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* O chat da Lígia, aberto no canto. */}
          <div className="flex min-w-0 flex-col border-border bg-surface-elevated md:border-l">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <Ligia tamanho={28} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[13px] font-semibold text-fg">Lígia</span>
                <span className="block text-[11px] text-fg-muted">BPO Financeiro</span>
              </span>
              <X size={15} className="flex-none text-fg-muted" />
            </div>
            <div className="flex flex-1 flex-col items-center px-4 pb-4 pt-7 text-center sm:pt-8">
              <span className="relative flex">
                <span className="c41-chamar pointer-events-none absolute -inset-3 rounded-full" />
                <Ligia tamanho={64} className="relative" />
              </span>
              <p className="mt-4 font-display text-[17px] font-semibold leading-tight text-fg">Oi, Camila! Eu sou a Lígia.</p>
              <p className="mt-0.5 text-[13.5px] text-fg-secondary">Em que posso ajudar?</p>
              <p className="mt-3 max-w-[270px] text-[11.5px] leading-relaxed text-fg-muted">
                Consulto o Connect com o mesmo acesso que você tem e <strong className="font-semibold text-fg-secondary">não altero nada sozinha</strong> — sugestão só vale depois do seu “Aplicar”.
              </p>
              <span className="mt-4 flex flex-col items-center gap-1.5">
                {SUGESTOES.map((s) => (
                  <span
                    key={s}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11.5px] text-fg-secondary"
                  >
                    <MessageSquareText size={12} className="flex-none text-brand" />
                    <span className="truncate">{s}</span>
                  </span>
                ))}
              </span>
            </div>
            <div className="px-3 pb-3">
              <span className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface py-2 pl-3.5 pr-2">
                <span className="flex-1 text-[12.5px] text-fg-muted">Pergunte à Lígia</span>
                <span className="flex size-7 flex-none items-center justify-center rounded-full bg-brand-solid text-on-brand">
                  <SendHorizontal size={13} />
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
