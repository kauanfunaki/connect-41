"use client";

import { useState } from "react";
import { Globe } from "lucide-react";
import { definirCartaoSobMedida, definirPrecosNoSite } from "@/app/(app)/admin/planos/actions";
import { Switch } from "@/components/ui/Switch";
import { useConfirm } from "@/components/ui/useConfirm";

type Props = {
  ligado: boolean;
  /** O cartão "Connect sob medida" no site (começa ligado). */
  sobMedida: boolean;
  /** Quantos planos ativos estão marcados "Mostrar no site". */
  noSite: number;
  /** Falta a migration: os interruptores ficam travados. */
  semTabela: boolean;
};

/**
 * O que vale para a seção Planos do site inteira (14/10/2026), no topo da tela
 * de Planos:
 *
 * - "Mostrar preços no site" — um interruptor para todos os planos. Decisão do
 *   Kauan e dos sócios: por enquanto, sem preço. Ligar publica o valor e a
 *   implantação de cada plano mostrado no site;
 * - "Mostrar o cartão “Connect sob medida”" — o cartão de quem quer começar
 *   por um ou dois setores, depois dos planos, sem preço. Começa ligado.
 *
 * Cada troca pede confirmação, que é onde aparece o erro se o servidor recusar.
 */
export function PrecosNoSite({ ligado, sobMedida, noSite, semTabela }: Props) {
  const [estado, setEstado] = useState(ligado);
  const [cartao, setCartao] = useState(sobMedida);
  const { dialog, requestConfirm } = useConfirm();

  async function salvar(mostrar: boolean) {
    const r = await definirPrecosNoSite(mostrar);
    if ("erro" in r) throw new Error(r.erro);
    setEstado(mostrar);
  }

  async function salvarCartao(mostrar: boolean) {
    const r = await definirCartaoSobMedida(mostrar);
    if ("erro" in r) throw new Error(r.erro);
    setCartao(mostrar);
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

  function alternarCartao(mostrar: boolean) {
    requestConfirm(
      mostrar
        ? {
            title: "Mostrar o cartão “Connect sob medida”?",
            description: "Ele volta para a seção Planos do site, depois dos planos, sem preço.",
            confirmLabel: "Mostrar cartão",
          }
        : {
            title: "Esconder o cartão “Connect sob medida”?",
            description: "A seção Planos do site fica só com os planos.",
            confirmLabel: "Esconder cartão",
          },
      () => salvarCartao(mostrar),
    );
  }

  const resumo =
    noSite === 0
      ? "Nenhum plano está no site: marque “Mostrar este plano no site” em Editar."
      : `${noSite} ${noSite === 1 ? "plano aparece" : "planos aparecem"} no site.`;
  const precos = estado ? "Com preço: valor e implantação de cada um." : "Sem preço: os cartões dizem “Valor sob consulta”.";
  const cartaoNoSite = cartao ? "Com o cartão “Connect sob medida”." : "Sem o cartão “Connect sob medida”.";

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
            : `${resumo} ${precos} ${cartaoNoSite}`}
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <Switch checked={estado} onCheckedChange={alternar} disabled={semTabela} rotulo="Mostrar preços no site" />
        <Switch checked={cartao} onCheckedChange={alternarCartao} disabled={semTabela} rotulo="Mostrar o cartão “Connect sob medida”" />
      </div>
      {dialog}
    </div>
  );
}
