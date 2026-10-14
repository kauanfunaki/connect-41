"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { JanelaDoTutorial } from "@/components/tutorial/JanelaDoTutorial";
import type { Tutorial } from "@/lib/tutorial/tutoriais";

type Concluir = () => Promise<{ ok: boolean }>;

/**
 * Grava "visto" sem segurar a tela: a janela já fechou, e se o banco recusar
 * o pior caso é o tutorial abrir de novo no próximo acesso.
 */
function marcarVisto(concluir: Concluir) {
  concluir().catch((err) => console.error("[tutorial] marcar como visto", err));
}

/**
 * O tutorial que abre sozinho no primeiro acesso (13/10/2026). O servidor só
 * monta este componente quando é para abrir (`TutorialDaEquipe`,
 * `TutorialDoPortal`); aqui ele nasce aberto, e terminar ou pular marca como
 * visto.
 *
 * `concluir` é a server action da sessão certa — a da equipe ou a do portal.
 * Não entra em dependência de efeito: a identidade dela muda a cada
 * revalidação.
 */
export function TutorialDoPrimeiroAcesso({ tutorial, concluir }: { tutorial: Tutorial; concluir: Concluir }) {
  const [aberto, setAberto] = useState(true);
  if (!aberto) return null;
  return (
    <JanelaDoTutorial
      tutorial={tutorial}
      onFim={() => {
        setAberto(false);
        marcarVisto(concluir);
      }}
    />
  );
}

/**
 * "Ver o tutorial de novo" (13/10/2026): o botão da Central de ajuda e da
 * conta do portal. Abre os mesmos passos do primeiro acesso; terminar também
 * marca como visto — para quem não tinha visto ainda, vale como visto.
 */
export function BotaoVerTutorial({
  tutorial,
  concluir,
  rotulo = "Ver o tutorial de novo",
}: {
  tutorial: Tutorial;
  concluir: Concluir;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberto(true)} aria-haspopup="dialog">
        <PlayCircle size={14} aria-hidden /> {rotulo}
      </Button>
      {aberto && (
        <JanelaDoTutorial
          tutorial={tutorial}
          onFim={() => {
            setAberto(false);
            marcarVisto(concluir);
          }}
        />
      )}
    </>
  );
}
