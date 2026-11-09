"use client";

// A tela do Robô do Societário ao vivo (09/11/2026). Era `force-dynamic` sem
// atualização: a tarefa andava na máquina e a tela só mudava com F5 — o botão
// "Resolver o captcha" nem aparecia. Agora ela se busca de novo sozinha: a
// cada poucos segundos enquanto há tarefa na fila, em execução ou pedindo
// ajuda, e devagar no resto. Com a aba escondida, para; ao voltar, busca na hora.
//
// `router.refresh()` não remonta nada: a confirmação de cancelar aberta e a
// rolagem ficam, e só os dados trocam.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { horaDeAtualizar, intervaloDaTelaDoRobo } from "@/lib/robo/chamadaNaTela";

/** A volta do relógio: curta, para a troca de ritmo e a volta à aba valerem logo. */
const VOLTA_MS = 1_000;

export function AtualizacaoDaTelaDoRobo({ naFila, pedindoAjuda }: { naFila: number; pedindoAjuda: number }) {
  const router = useRouter();
  const intervalo = intervaloDaTelaDoRobo({ naFila, pedindoAjuda });

  useEffect(() => {
    let ultimaEm = Date.now();
    function talvezAtualizar() {
      const agora = Date.now();
      if (!horaDeAtualizar(ultimaEm, agora, document.visibilityState === "visible", intervalo)) return;
      ultimaEm = agora;
      router.refresh();
    }
    const relogio = window.setInterval(talvezAtualizar, VOLTA_MS);
    document.addEventListener("visibilitychange", talvezAtualizar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", talvezAtualizar);
    };
  }, [intervalo, router]);

  return null;
}
