"use client";

import { AlarmClock, CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Contador } from "@/components/ui/Contador";
import { addDaysToKey, diaDaListaLabel, intervaloLabel } from "@/lib/agenda";
import { listaDePrazos, type PrazoDaAgenda } from "@/lib/prazosDaAgendaRegras";
import { LinhaDoPrazo } from "./LinhaDoPrazo";

type Props = {
  /** Os prazos já filtrados pelas fontes ligadas (e pelo setor, quando há). */
  prazos: PrazoDaAgenda[];
  de: string;
  ate: string;
  hoje: string;
  /** Há fonte desligada: o vazio sugere ligar. */
  temFonteDesligada: boolean;
};

function tituloDoDia(dia: string, hoje: string): string {
  const nome = diaDaListaLabel(dia);
  const curto = nome.charAt(0).toLowerCase() + nome.slice(1);
  if (dia === hoje) return `Hoje · ${curto}`;
  if (dia === addDaysToKey(hoje, 1)) return `Amanhã · ${curto}`;
  return nome;
}

/**
 * A visão Prazos (10/11/2026, desenho A aprovado pelo Kauan): o que vence,
 * dia a dia, no período — e, quando o período começa hoje, os atrasados dos
 * últimos 30 dias num grupo à parte, no alto. É a Agenda do setor que não faz
 * reunião: nada de grade de horas vazia.
 */
export function ListaDosPrazos({ prazos, de, ate, hoje, temFonteDesligada }: Props) {
  const { atrasados, dias } = listaDePrazos(prazos, de, ate);

  if (atrasados.length === 0 && dias.length === 0) {
    return (
      <EmptyState
        icon={<CalendarCheck />}
        title="Nenhum prazo neste período"
        description={`Nada vence de ${intervaloLabel(de, ate)} nas fontes ligadas. ${
          temFonteDesligada ? "Ligue outras fontes nos botões acima ou use as setas" : "Use as setas"
        } para ver outro período.`}
      />
    );
  }

  return (
    <div className="px-5 pb-4">
      {atrasados.length > 0 && (
        <section aria-labelledby="prazos-atrasados" className="pt-4">
          <h3 id="prazos-atrasados" className="flex items-center gap-2 pb-1 text-fs-2 font-semibold text-danger">
            <AlarmClock size={14} aria-hidden /> Atrasados
            <Contador valor={atrasados.length} teto={Number.MAX_SAFE_INTEGER} />
          </h3>
          <ul className="divide-y divide-border">
            {atrasados.map((p) => (
              <li key={p.chave}>
                <LinhaDoPrazo prazo={p} mostrarDia />
              </li>
            ))}
          </ul>
        </section>
      )}
      {dias.map(({ dia, prazos: doDia }) => (
        <section key={dia} aria-labelledby={`prazos-${dia}`} className="pt-4">
          <h3 id={`prazos-${dia}`} className="c41-rotulo pb-1">
            {tituloDoDia(dia, hoje)}
          </h3>
          <ul className="divide-y divide-border">
            {doDia.map((p) => (
              <li key={p.chave}>
                <LinhaDoPrazo prazo={p} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
