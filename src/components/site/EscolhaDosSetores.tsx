"use client";

import { useId, useState } from "react";
import { Check, Mail } from "lucide-react";
import type { SetorDoSite } from "@/lib/planos/site-regras";
import { alternarSetor, linkDoSobMedida, resumoDaEscolha, rotulosEscolhidos } from "@/lib/planos/sobMedida";
import { BOTAO_GRANDE, PRIMARIO, corDoSetor } from "./estilos";

// As etiquetas e o "Montar meu plano" do cartão "Connect sob medida"
// (14/10/2026) — a única parte de cliente do cartão. Cada etiqueta é um botão
// de ligar e desligar (`aria-pressed`); o link do e-mail acompanha a escolha,
// com os setores no corpo, na ordem das etiquetas.
//
// Sem JavaScript, as etiquetas não respondem e o link abre o e-mail só com o
// assunto: o contato funciona do mesmo jeito. O HTML do servidor já sai assim
// (nada escolhido), então a página não muda ao carregar.

export function EscolhaDosSetores({ setores, contato }: { setores: SetorDoSite[]; contato: string }) {
  const [escolhidos, setEscolhidos] = useState<ReadonlySet<string>>(() => new Set());
  const idDoRotulo = useId();

  const alternar = (code: string) => setEscolhidos((atual) => alternarSetor(atual, code));
  const rotulos = rotulosEscolhidos(setores, escolhidos);

  return (
    <>
      <div role="group" aria-labelledby={idDoRotulo} className="relative">
        <p id={idDoRotulo} className="text-fs-4 font-medium text-fg">
          Escolha os setores que te interessam
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {setores.map((s) => {
            const escolhido = escolhidos.has(s.code);
            return (
              <li key={s.code}>
                <button
                  type="button"
                  aria-pressed={escolhido}
                  onClick={() => alternar(s.code)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-fs-3 font-medium transition-colors ${
                    escolhido
                      ? "border-brand bg-brand-subtle text-fg"
                      : "border-border bg-surface-elevated text-fg hover:border-border-strong"
                  }`}
                >
                  <span aria-hidden className="flex size-3.5 flex-none items-center justify-center">
                    {escolhido ? (
                      <Check size={14} strokeWidth={2.4} className="text-brand" />
                    ) : (
                      <span className="size-2 rounded-full" style={{ background: corDoSetor(s.code, s.cor) }} />
                    )}
                  </span>
                  {s.rotulo}
                </button>
              </li>
            );
          })}
        </ul>
        {/* O leitor de tela ouve a conta a cada troca. A linha fica reservada
            mesmo vazia, para o botão não pular ao escolher o primeiro setor. */}
        <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-fs-3 text-fg-muted">
          {resumoDaEscolha(rotulos.length)}
        </p>
      </div>

      <a href={linkDoSobMedida(contato, rotulos)} className={`${BOTAO_GRANDE} ${PRIMARIO} relative mt-auto self-start`}>
        <Mail size={18} aria-hidden className="flex-none" />
        Montar meu plano
      </a>
    </>
  );
}
