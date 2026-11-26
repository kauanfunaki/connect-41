"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { HandoffSectorStatus } from "@/generated/prisma/enums";
import { Modal } from "@/components/ui/Modal";
import { SinalDoSetor } from "@/components/transferencias/RotaDosSetores";
import { HANDOFF_STATUS_LABEL } from "@/lib/handoffs";

/** A ordem dos sinais na legenda: o caminho da parte, e a devolução no fim. */
const ORDEM_DA_LEGENDA: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS", "DONE", "RETURNED"];

/** O que cada sinal quer dizer, numa frase. */
const SIGNIFICADO: Record<HandoffSectorStatus, string> = {
  NEW: "O setor recebeu a parte dele e ninguém começou ainda.",
  IN_PROGRESS: "O setor já começou a cuidar da parte dele.",
  DONE: "O setor terminou a parte dele.",
  RETURNED: "O setor devolveu a parte a quem pediu, com o motivo, e espera a resposta. O assunto ganha a etiqueta “Devolvida”.",
};

/**
 * O botão "Legenda" da barra da lista, colado ao Filtros, que abre a legenda
 * dos sinais num modal (26/11/2026, melhoria-811). A legenda ficava embaixo
 * da tabela, sempre à vista, numa linha só de ícone e nome; aqui cada sinal
 * ganha também o que significa. O botão é o mesmo do Filtros (altura, borda,
 * peso), para os dois lerem como um par.
 */
export function BotaoDaLegenda() {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-button-sm font-semibold transition-colors flex-shrink-0 ${
          aberta ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg-secondary hover:bg-surface-hover"
        }`}
      >
        <Info size={14} aria-hidden />
        Legenda
      </button>
      <Modal open={aberta} onClose={() => setAberta(false)} title="Legenda">
        <div className="flex flex-col gap-4">
          <section aria-labelledby="legenda-assunto">
            <h3 id="legenda-assunto" className="c41-rotulo mb-2">
              No assunto
            </h3>
            <ul className="flex flex-col gap-3">
              <ItemDaLegenda
                sinal={<span className="size-[7px] rounded-full bg-brand" />}
                nome="Ainda não aberta por você"
                texto="Você ainda não abriu esta transferência. O assunto fica em negrito até você abrir."
              />
            </ul>
          </section>
          <section aria-labelledby="legenda-setores">
            <h3 id="legenda-setores" className="c41-rotulo mb-2">
              Na coluna Setores
            </h3>
            <p className="mb-3 text-fs-2 text-fg-muted">Cada setor que recebe a transferência mostra, no próprio nome, a situação da parte dele.</p>
            <ul className="flex flex-col gap-3">
              {ORDEM_DA_LEGENDA.map((s) => (
                <ItemDaLegenda key={s} sinal={<SinalDoSetor status={s} tamanho={16} />} nome={HANDOFF_STATUS_LABEL[s]} texto={SIGNIFICADO[s]} />
              ))}
            </ul>
          </section>
        </div>
      </Modal>
    </>
  );
}

/** Uma linha da legenda: o sinal (decorativo — o nome está ao lado), o nome e o que quer dizer. */
function ItemDaLegenda({ sinal, nome, texto }: { sinal: React.ReactNode; nome: string; texto: string }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center">
        {sinal}
      </span>
      <span className="min-w-0">
        <span className="block text-ui font-semibold text-fg">{nome}</span>
        <span className="block text-fs-2 text-fg-secondary">{texto}</span>
      </span>
    </li>
  );
}
