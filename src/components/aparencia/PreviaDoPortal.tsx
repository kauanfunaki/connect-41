"use client";

import { FileText, House, ListChecks, MessageSquarePlus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { variaveisDaAparencia, type Aparencia, type GrupoDeCor } from "@/lib/aparencia/cores";

type Tema = "claro" | "escuro";

const ITENS: { rotulo: string; grupo: GrupoDeCor; icone: React.ReactNode }[] = [
  { rotulo: "Contas a pagar", grupo: "financeiro", icone: <Wallet /> },
  { rotulo: "Documentos fiscais", grupo: "fiscal", icone: <FileText /> },
  { rotulo: "Processos", grupo: "processos", icone: <ListChecks /> },
  { rotulo: "Solicitações", grupo: "atendimento", icone: <MessageSquarePlus /> },
];

/**
 * A prévia da Aparência do portal (21/10/2026): um pedaço do portal — o menu,
 * o título, o cartão do número, o cabeçalho da tabela e os botões — nos dois
 * temas, lado a lado, com as cores ainda não salvas.
 *
 * Cada tema é uma caixa com a classe `c41-previa-clara`/`c41-previa-escura`,
 * que o globals.css veste com os tokens daquele tema, e as cores escolhidas
 * entram nas mesmas variáveis pelo `style` — o cálculo é o do portal
 * (`variaveisDaAparencia`), então o que se vê aqui é o que o cliente vê.
 */
export function PreviaDoPortal({ aparencia, logo }: { aparencia: Aparencia; logo: { src: string; nome: string } | null }) {
  const v = variaveisDaAparencia(aparencia);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <Painel tema="claro" estilo={{ ...v.comum, ...v.claro }} logo={logo} />
      <Painel tema="escuro" estilo={{ ...v.comum, ...v.escuro }} logo={logo} />
    </div>
  );
}

function Painel({ tema, estilo, logo }: { tema: Tema; estilo: Record<string, string>; logo: { src: string; nome: string } | null }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1.5 text-helper text-fg-muted">{tema === "claro" ? "Tema claro" : "Tema escuro"}</figcaption>
      <div
        aria-hidden
        className={`${tema === "claro" ? "c41-previa-clara" : "c41-previa-escura"} flex overflow-hidden rounded-lg border border-border bg-canvas text-fg`}
        style={estilo as React.CSSProperties}
      >
        <div className="w-[138px] flex-shrink-0 border-r border-border bg-sidebar-bg px-2 py-2.5">
          <div className="mb-2 flex h-7 items-center px-1.5">
            {logo ? (
              <span className="flex min-w-0 items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo.src} alt="" className="size-6 flex-shrink-0 rounded-sm object-contain" />
                <span className="truncate text-fs-1 font-semibold">{logo.nome}</span>
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tema === "claro" ? "/brand/logo-horizontal-light.svg" : "/brand/logo-horizontal-dark.svg"} alt="" className="h-5 w-auto" />
            )}
          </div>
          <Item rotulo="Início" icone={<House />} />
          <p data-grupo="financeiro" className="flex items-center gap-1 px-1.5 pb-1 pt-2.5 c41-rotulo">
            <span className="size-1.5 rounded-full bg-grupo" />
            Financeiro
          </p>
          {ITENS.map((i, n) => (
            <Item key={i.rotulo} rotulo={i.rotulo} icone={i.icone} grupo={i.grupo} ativo={n === 0} />
          ))}
        </div>

        <div data-grupo="financeiro" className="min-w-0 flex-1 p-3">
          <span className="mb-2 block h-[3px] w-6 rounded-full bg-[var(--c41-setor)]" />
          <p className="truncate font-display text-fs-6 font-bold leading-tight">Contas a pagar</p>
          <p className="mt-0.5 truncate text-fs-1 text-fg-secondary">O que suas empresas têm a pagar.</p>
          <div className="mt-2.5 rounded-md bg-[linear-gradient(135deg,var(--c41-destaque-numero-de),var(--c41-destaque-numero-ate))] px-2.5 py-2 text-on-brand">
            <p className="text-fs-1 opacity-90">A pagar este mês</p>
            <p className="font-display text-fs-6 font-bold tabular-nums">R$ 12.480,00</p>
          </div>
          <div className="mt-2.5 overflow-hidden rounded-md border border-border bg-surface">
            <p className="flex justify-between bg-table-header-bg px-2 py-1 text-fs-1 font-semibold uppercase tracking-wider text-table-header-fg">
              <span>Fornecedor</span>
              <span>Valor</span>
            </p>
            <p className="flex justify-between gap-2 px-2 py-1.5 text-fs-1">
              <span className="truncate">Aluguel da sede</span>
              <span className="whitespace-nowrap tabular-nums">R$ 4.200,00</span>
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="xs" tabIndex={-1}>
              Aprovar
            </Button>
            <span className="text-fs-1 font-medium text-brand">Ver detalhes</span>
          </div>
        </div>
      </div>
    </figure>
  );
}

function Item({ rotulo, icone, grupo, ativo = false }: { rotulo: string; icone: React.ReactNode; grupo?: GrupoDeCor; ativo?: boolean }) {
  return (
    <p
      data-grupo={grupo}
      className={`relative flex items-center gap-1.5 rounded-md px-1.5 py-1 text-fs-1 font-medium ${
        ativo ? "bg-brand-solid text-on-brand" : "text-fg-secondary"
      }`}
    >
      {ativo && <span className="absolute -left-2 top-1 bottom-1 w-[3px] rounded-r-full bg-[var(--c41-setor)]" />}
      <span className={`flex-shrink-0 [&>svg]:size-3.5 ${grupo && !ativo ? "text-grupo" : ""}`}>{icone}</span>
      <span className="truncate">{rotulo}</span>
    </p>
  );
}
