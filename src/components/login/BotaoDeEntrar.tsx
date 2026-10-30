"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * O "Entrar" do login da equipe (auditoria de UX, 30/10/2026). O formulário é
 * um POST nativo — funciona sem JavaScript —, e por isso o botão não sabia que
 * o envio tinha começado: dava para clicar duas vezes e nada dizia que estava
 * entrando. Aqui ele escuta o `submit` do próprio formulário, mostra "Entrando…"
 * e trava. Voltar pelo navegador (a página sai do cache) destrava.
 */
export function BotaoDeEntrar({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const aoEnviar = () => setEntrando(true);
    const aoVoltar = (e: PageTransitionEvent) => {
      if (e.persisted) setEntrando(false);
    };
    form.addEventListener("submit", aoEnviar);
    window.addEventListener("pageshow", aoVoltar);
    return () => {
      form.removeEventListener("submit", aoEnviar);
      window.removeEventListener("pageshow", aoVoltar);
    };
  }, []);

  return (
    <Button ref={ref} type="submit" size="md" className={className} loading={entrando} loadingLabel="Entrando…">
      Entrar
    </Button>
  );
}
