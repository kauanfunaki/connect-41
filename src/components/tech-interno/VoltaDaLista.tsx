"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ROTA_TECH_INTERNO, destinoDeVolta } from "@/lib/tech-interno/regras";

/**
 * A volta para a lista do Controle interno (10/11/2026, junto com o endereço
 * curto do item). Até aqui o recorte da lista — visão, filtros e página — ia
 * no endereço do item, em `?voltar=…`, e o endereço ficava longo demais para
 * passar adiante. Agora a lista guarda o recorte na aba do navegador
 * (`sessionStorage`) a cada troca, inclusive na troca sem recarregar
 * (`NavegacaoSemRecarregar`), que muda a query sem remontar a tela; o
 * "Voltar para a lista" lê de lá. O Histórico guarda o dele do mesmo jeito: o
 * item aberto de lá volta para lá. Sem nada guardado — o link veio de fora, de
 * outra aba, ou o navegador bloqueia o armazenamento —, cai na lista limpa.
 *
 * O histórico do navegador (`router.back()`) não serve aqui: depois de
 * editar, o item volta para a visualização por `replace`, e quem chega por um
 * link colado não tem a lista atrás.
 */
const CHAVE = "c41:controle-interno:lista";

function lerDaAba(): string {
  try {
    return destinoDeVolta(window.sessionStorage.getItem(CHAVE));
  } catch {
    return ROTA_TECH_INTERNO;
  }
}
// O valor só muda quando a própria lista grava, numa tela que não é esta.
const semAvisos = () => () => {};

/** Fica na lista (Lista e Kanban) e no Histórico: guarda o recorte que está à vista. */
export function LembrarDaLista({ endereco }: { endereco: string }) {
  useEffect(() => {
    try {
      window.sessionStorage.setItem(CHAVE, destinoDeVolta(endereco));
    } catch {
      // Sem armazenamento, a volta cai na lista limpa.
    }
  }, [endereco]);
  return null;
}

/** O endereço da lista de onde a pessoa veio, nesta aba; no servidor, a lista limpa. */
export function useVoltaDaLista(): string {
  return useSyncExternalStore(semAvisos, lerDaAba, () => ROTA_TECH_INTERNO);
}

export function VoltarParaALista() {
  const href = useVoltaDaLista();
  return (
    <Button variant="secondary" href={href}>
      <ArrowLeft size={14} aria-hidden />
      Voltar para a lista
    </Button>
  );
}
