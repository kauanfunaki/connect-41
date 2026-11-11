"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import {
  ANCORA_DO_SELETOR_DO_INICIO,
  EVENTO_DA_EMPRESA_DO_PORTAL,
  empresaAtivaDoPortal,
  empresaGuardadaNoNavegador,
} from "@/lib/portal/empresaEscolhida";

export type EmpresaDoTopo = { id: string; nome: string };

function assinar(aviso: () => void) {
  window.addEventListener(EVENTO_DA_EMPRESA_DO_PORTAL, aviso);
  return () => window.removeEventListener(EVENTO_DA_EMPRESA_DO_PORTAL, aviso);
}
const lerCookie = () => empresaGuardadaNoNavegador(document.cookie);

/**
 * A empresa escolhida, à vista no topo do portal (11/11/2026).
 *
 * A escolha vale para as telas seguintes (o cookie do portal), e nada dizia
 * isso fora da tela que tem o seletor: o cliente abria Pendências ou Processos
 * sem saber se estava vendo uma empresa ou todas. O selo diz qual, e um toque
 * leva ao seletor do Início para trocar.
 *
 * Mesma regra das telas (`empresaAtivaDoPortal`): a da URL vence a guardada, e
 * só vale empresa do acesso. Sem escolha — "Todas as empresas" — ou com uma
 * empresa só, nada aparece: não há o que lembrar.
 *
 * A moldura não é desenhada de novo a cada navegação, então o selo lê o cookie
 * no navegador e escuta a troca (`guardarEmpresaDoPortal` avisa). Antes da
 * hidratação vale o cookie que o servidor leu, para o selo não piscar.
 */
export function EmpresaAtivaNoTopo({
  empresas,
  guardadaNoServidor,
  variante,
  onIr,
}: {
  empresas: EmpresaDoTopo[];
  guardadaNoServidor: string | null;
  /** Na barra do celular (à direita do nome) ou no bloco do acesso, na lateral. */
  variante: "barra" | "lateral";
  onIr?: () => void;
}) {
  const daUrl = useSearchParams().get("empresa");
  const guardada = useSyncExternalStore(assinar, lerCookie, () => guardadaNoServidor);
  const ativa = empresaAtivaDoPortal(daUrl, guardada, empresas);
  if (!ativa) return null;

  return (
    // O alvo é o link inteiro, com 44px de altura no toque; o selo desenhado
    // dentro é miúdo, para não competir com o título da tela.
    <Link
      href={`/portal#${ANCORA_DO_SELETOR_DO_INICIO}`}
      onClick={onIr}
      aria-label={`Vendo a empresa ${ativa.nome}. Trocar a empresa no Início`}
      data-dica={`${ativa.nome} · trocar no Início`}
      className={`group inline-flex min-w-0 items-center rounded-full focus-visible:outline-none ${
        variante === "barra" ? "ml-auto min-h-11 max-w-[55%] flex-shrink" : "mt-1 max-w-full min-h-11 lg:min-h-8"
      }`}
    >
      <span className="inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-helper font-medium text-fg-secondary transition-colors group-hover:border-brand/50 group-hover:text-fg group-active:bg-surface-hover group-focus-visible:ring-2 group-focus-visible:ring-brand/40">
        <Building2 size={14} aria-hidden className="flex-shrink-0 text-fg-muted" />
        <span className="truncate">{ativa.nome}</span>
      </span>
    </Link>
  );
}
