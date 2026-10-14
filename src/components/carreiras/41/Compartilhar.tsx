"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link2, MessageCircle, Share2 } from "lucide-react";

/**
 * Compartilhar a vaga: LinkedIn, WhatsApp e "Copiar link" com aviso de
 * copiado. Os links são os de compartilhamento de cada rede, com o endereço
 * canônico da vaga (no 41 Carreiras).
 */
export function Compartilhar({ url, linkedin, whatsapp }: { url: string; linkedin: string; whatsapp: string }) {
  const [copiado, setCopiado] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (relogio.current) clearTimeout(relogio.current);
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sem a área de transferência (navegador antigo, página sem HTTPS): o
      // jeito antigo, por um campo escondido.
      const campo = document.createElement("textarea");
      campo.value = url;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      campo.remove();
    }
    setCopiado(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setCopiado(false), 2500);
  }

  return (
    <div className="t41-compartilhar">
      <p className="t41-selo t41-selo--roxo">Compartilhar a vaga</p>
      <div className="t41-compartilhar__botoes">
        <a href={linkedin} target="_blank" rel="noopener noreferrer" className="t41-compartilhar__botao">
          <Share2 size={18} aria-hidden="true" />
          LinkedIn
        </a>
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="t41-compartilhar__botao">
          <MessageCircle size={18} aria-hidden="true" />
          WhatsApp
        </a>
        <button type="button" className="t41-compartilhar__botao" onClick={copiar} data-copiado={copiado ? "true" : undefined}>
          {copiado ? <Check size={18} aria-hidden="true" /> : <Link2 size={18} aria-hidden="true" />}
          {copiado ? "Copiado!" : "Copiar link"}
        </button>
      </div>
      <p className="t41-sr" aria-live="polite">
        {copiado ? "Link da vaga copiado." : ""}
      </p>
    </div>
  );
}
