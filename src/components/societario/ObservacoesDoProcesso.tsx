"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { partesComLinks } from "@/lib/textoComLinks";

/**
 * Texto corrido com os endereços clicáveis, abrindo em outra aba. As quebras
 * de linha ficam por conta de quem envolve (`whitespace-pre-wrap`).
 */
export function TextoComLinks({ texto }: { texto: string }) {
  return (
    <>
      {partesComLinks(texto).map((p, i) =>
        p.tipo === "texto" ? (
          p.texto
        ) : (
          <a
            key={i}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline underline-offset-2 decoration-brand/40 hover:decoration-brand [overflow-wrap:anywhere]"
          >
            {p.url}
          </a>
        )
      )}
    </>
  );
}

// Acima disto o texto passa da altura da caixa (max-h-96, umas 17 linhas de
// 14px) e ganha "Ver tudo". Conta por linha e por tamanho porque o Trello
// manda tanto descrição de um parágrafo só quanto checklist de 40 itens.
const LINHAS_ANTES_DE_CORTAR = 16;
const CARACTERES_ANTES_DE_CORTAR = 1400;

/**
 * As observações internas do processo (07/10/2026). É onde a importação do
 * Trello põe descrição, checklists e comentários do cartão — até 60 mil
 * caracteres, que saíam em 12px, sem altura máxima e com o endereço do cartão
 * como texto puro.
 *
 * Agora: corpo no tamanho de leitura da ficha (14px), caixa com altura máxima
 * e rolagem, "Ver tudo" para abrir de vez, e o endereço do cartão clicável.
 * Fechado por padrão, porque é longo. Só a equipe vê: o portal não lê `notes`.
 */
export function ObservacoesDoProcesso({ texto }: { texto: string }) {
  const [tudo, setTudo] = useState(false);
  const longo = texto.split("\n").length > LINHAS_ANTES_DE_CORTAR || texto.length > CARACTERES_ANTES_DE_CORTAR;

  return (
    <details className="rounded-md border border-border bg-surface-2 px-3 py-2">
      <summary className="cursor-pointer text-[length:var(--fs-ui)] font-medium text-fg">
        Observações internas <span className="font-normal text-fg-muted">· só a equipe vê</span>
      </summary>
      <div
        className={`mt-2 whitespace-pre-wrap break-words text-[length:var(--fs-label)] leading-relaxed text-fg-secondary ${
          longo && !tudo ? "max-h-96 overflow-y-auto pr-2" : ""
        }`}
      >
        <TextoComLinks texto={texto} />
      </div>
      {longo && (
        <Button variant="ghost" size="xs" className="mt-2" onClick={() => setTudo((v) => !v)} aria-expanded={tudo}>
          {tudo ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {tudo ? "Mostrar menos" : "Ver tudo"}
        </Button>
      )}
    </details>
  );
}
