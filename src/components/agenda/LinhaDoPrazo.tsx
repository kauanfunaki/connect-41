"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { defDaFonte, type FonteDaAgenda } from "@/lib/fontesDaAgenda";
import type { PrazoDaAgenda } from "@/lib/prazosDaAgendaRegras";

/** A fonte do prazo, na cor dela: bolinha e nome. */
export function PilulaDaFonte({ fonte }: { fonte: FonteDaAgenda }) {
  const def = defDaFonte(fonte);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-micro font-medium text-fg-secondary whitespace-nowrap">
      <span aria-hidden className="size-2 flex-shrink-0 rounded-full" style={{ background: def.cor }} />
      {def.rotulo}
    </span>
  );
}

/** "atrasada" no vermelho e "risco de multa" no âmbar, os dois tons de situação do Selo. */
export function SelosDoPrazo({ prazo }: { prazo: PrazoDaAgenda }) {
  if (!prazo.atrasada && !prazo.riscoDeMulta) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {prazo.riscoDeMulta && <Selo tom="atencao">risco de multa</Selo>}
      {prazo.atrasada && <Selo tom="perigo">atrasada</Selo>}
    </span>
  );
}

type Props = {
  prazo: PrazoDaAgenda;
  /** "lista": uma linha larga (a visão Prazos). "compacta": empilhada (o dia aberto ao lado do Mês). */
  variante?: "lista" | "compacta";
  /** Na lista de atrasados, a data vai na linha: o dia não está no título do grupo. */
  mostrarDia?: boolean;
};

function diaCurto(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Um prazo na lista (10/11/2026, desenho A aprovado pelo Kauan): a fonte, o
 * título (que leva à tela do prazo), a empresa e quem, e os selos. A entrada
 * que junta vários ("DCTFWeb · 6 empresas") abre os itens no "Ver as N" — um
 * recolhível, e começa fechado.
 */
export function LinhaDoPrazo({ prazo, variante = "lista", mostrarDia = false }: Props) {
  const [aberto, setAberto] = useState(false);
  const idDaLista = useId();
  const itens = prazo.itens ?? [];
  const titulo = (
    <Link href={prazo.href} className="min-w-0 font-semibold text-fg hover:text-brand hover:underline">
      {prazo.titulo}
    </Link>
  );
  const verAs = itens.length > 0 && (
    <Button
      variant="ghost"
      size="xs"
      aria-expanded={aberto}
      aria-controls={idDaLista}
      onClick={() => setAberto((v) => !v)}
    >
      {aberto ? "Fechar" : `Ver ${itens.length === 1 ? "o item" : `as ${itens.length}`}`}
      <ChevronDown size={12} aria-hidden className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
    </Button>
  );
  // Quando todos têm o mesmo título (as seis DCTFWeb), o que distingue um do
  // outro é a empresa, o começo do detalhe; senão (dez atividades), o título.
  const mesmoTitulo = itens.every((i) => i.titulo === itens[0]?.titulo);
  const filhos = aberto && itens.length > 0 && (
    <ul id={idDaLista} className="mt-1 mb-1 ml-1 border-l-2 border-border pl-3 space-y-1.5">
      {itens.map((i) => {
        const partes = i.detalhe ? i.detalhe.split(" · ") : [];
        const nome = mesmoTitulo && partes.length > 0 ? partes[0] : i.titulo;
        const resto = mesmoTitulo ? partes.slice(1).join(" · ") : i.detalhe;
        return (
          <li key={i.chave} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-fs-2">
            <Link href={i.href} className="font-medium text-fg hover:text-brand hover:underline">
              {nome}
            </Link>
            {resto && <span className="text-fg-muted">{resto}</span>}
            <SelosDoPrazo prazo={i} />
          </li>
        );
      })}
    </ul>
  );

  if (variante === "compacta") {
    return (
      <div className="flex flex-col gap-1 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <PilulaDaFonte fonte={prazo.fonte} />
          {mostrarDia && <span className="text-micro text-fg-muted tnum">{diaCurto(prazo.dia)}</span>}
          <SelosDoPrazo prazo={prazo} />
        </div>
        <p className="text-fs-3 leading-snug">{titulo}</p>
        {prazo.detalhe && <p className="text-fs-2 text-fg-secondary">{prazo.detalhe}</p>}
        {verAs && <div>{verAs}</div>}
        {filhos}
      </div>
    );
  }

  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
        <span className="w-32 flex-shrink-0">
          <PilulaDaFonte fonte={prazo.fonte} />
        </span>
        {mostrarDia && <span className="w-12 flex-shrink-0 text-fs-2 text-fg-muted tnum">{diaCurto(prazo.dia)}</span>}
        <p className="min-w-0 text-fs-3 sm:w-64 sm:flex-shrink-0 sm:truncate">{titulo}</p>
        <p className="min-w-0 flex-1 text-fs-2 text-fg-secondary sm:truncate">{prazo.detalhe}</p>
        <span className="flex flex-shrink-0 items-center gap-2">
          <SelosDoPrazo prazo={prazo} />
          {verAs}
        </span>
      </div>
      {filhos}
    </div>
  );
}
