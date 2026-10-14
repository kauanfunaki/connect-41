"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { definirPrecosNoSite } from "@/app/(app)/admin/planos/actions";
import { Switch } from "@/components/ui/Switch";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  ligado: boolean;
  /** Quantos planos ativos estão marcados "Mostrar no site". */
  noSite: number;
  /** Falta a migration: o interruptor fica travado. */
  semTabela: boolean;
};

/**
 * "Mostrar preços no site" (14/10/2026) — um interruptor para todos os planos.
 * Decisão do Kauan e dos sócios: por enquanto, sem preço. Ligar publica o valor
 * e a implantação de cada plano mostrado no site, e pede confirmação; desligar
 * volta ao "Valor sob consulta" na hora.
 */
export function PrecosNoSite({ ligado, noSite, semTabela }: Props) {
  const [estado, setEstado] = useState(ligado);
  const { dialog, requestConfirm } = useConfirm();

  async function salvar(mostrar: boolean) {
    const r = await definirPrecosNoSite(mostrar);
    if ("erro" in r) throw new Error(r.erro);
    setEstado(mostrar);
  }

  function alternar(mostrar: boolean) {
    if (mostrar) {
      requestConfirm(
        {
          title: "Mostrar os preços no site?",
          description:
            "Quem abrir o site do Connect vai ver o valor e a implantação de cada plano mostrado lá. Dá para desligar quando quiser.",
          confirmLabel: "Mostrar preços",
        },
        () => salvar(true),
      );
    } else {
      requestConfirm(
        { title: "Esconder os preços do site?", description: "Os cartões voltam a dizer “Valor sob consulta”.", confirmLabel: "Esconder preços" },
        () => salvar(false),
      );
    }
  }

  const resumo =
    noSite === 0
      ? "Nenhum plano está no site: marque “Mostrar este plano no site” em Editar."
      : `${noSite} ${noSite === 1 ? "plano aparece" : "planos aparecem"} no site.`;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-surface px-4 py-3.5 shadow-xs">
      <span className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-subtle text-brand">
        <Globe size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ui font-medium text-fg">Site do Connect</p>
        <p className="text-helper text-fg-muted">
          {semTabela
            ? "Falta a atualização do banco desta versão do Connect. Até ela rodar, a seção Planos não aparece no site."
            : `${resumo} ${estado ? "Com preço: valor e implantação de cada um." : "Sem preço: os cartões dizem “Valor sob consulta”."}`}
        </p>
      </div>
      <Switch checked={estado} onCheckedChange={alternar} disabled={semTabela} rotulo="Mostrar preços no site" />
      {dialog}
    </div>
  );
}
