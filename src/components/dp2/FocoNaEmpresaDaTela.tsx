"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { trabalharNaEmpresa } from "@/app/(app)/foco-actions";

/**
 * Põe a faixa do topo na empresa desta tela quando ninguém escolheu empresa
 * (17/11/2026, bug-724). Quem abria a competência pelo Painel do DP 2 via
 * "Nenhuma empresa escolhida" em cima da folha da Panificadora, e ao voltar
 * para a Competência do mês tinha de escolher a mesma empresa de novo. Só age
 * sem foco: com outra empresa escolhida, a tela já pede para trocar na faixa.
 */
export function FocoNaEmpresaDaTela({ companyId }: { companyId: string }) {
  const router = useRouter(), feito = useRef(false);
  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    void trabalharNaEmpresa(companyId).then((r) => { if (r.ok) router.refresh(); }).catch(() => undefined);
  }, [companyId, router]);
  return null;
}
