"use client";

import { useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";

/**
 * "Candidatar-se" preso embaixo da tela, no celular (15/10/2026) — quem chega
 * do LinkedIn ou do WhatsApp lê a vaga e tem o botão sempre à mão. Some
 * quando o formulário está à vista (não faz sentido apontar para onde a
 * pessoa já está).
 */
export function BarraCandidatar({ titulo, prazo }: { titulo: string; prazo: string | null }) {
  const [formularioVisivel, setFormularioVisivel] = useState(false);

  useEffect(() => {
    const alvo = document.getElementById("candidatura");
    if (!alvo || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(([e]) => setFormularioVisivel(!!e?.isIntersecting), { threshold: 0.05 });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  return (
    <div className="t41-barra-fixa" data-escondida={formularioVisivel ? "true" : undefined}>
      <p className="t41-barra-fixa__texto">
        <strong>{titulo}</strong>
        {prazo ?? "Inscrições abertas"}
      </p>
      <a href="#candidatura" className="t41-botao t41-botao--primario" tabIndex={formularioVisivel ? -1 : undefined}>
        Candidatar-se <ArrowDown size={17} aria-hidden="true" />
      </a>
    </div>
  );
}
