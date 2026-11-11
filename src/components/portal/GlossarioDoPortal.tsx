"use client";

import { useState } from "react";
import { BookOpenText } from "lucide-react";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { GLOSSARIO_DO_PORTAL, ancoraDoTermo, buscarNoGlossario } from "@/lib/portal/glossario";

/**
 * "O que quer dizer…" na Ajuda do portal (11/11/2026, P31): os termos da
 * contabilidade que aparecem nas telas, em palavras simples, com uma busca só
 * deles. Cada termo é um bloco com âncora (`#termo-<chave>`): quem chega por
 * um link de outra tela cai nele, destacado pelo `:target`.
 *
 * Lista sempre aberta, e não sanfona: são poucos termos e curtos, e o link
 * direto precisa mostrar a explicação sem mais um toque.
 */
export function GlossarioDoPortal() {
  const [busca, setBusca] = useState("");
  const termos = buscarNoGlossario(busca);

  return (
    <section aria-labelledby="ajuda-o-que-quer-dizer">
      <h2 id="ajuda-o-que-quer-dizer" className="font-display text-section font-semibold text-fg">
        O que quer dizer…
      </h2>
      <p className="mt-1 mb-3 max-w-[60ch] text-body text-fg-muted">As palavras do escritório que aparecem no portal, explicadas sem complicação.</p>
      <div className="mb-4 max-w-xl">
        <CampoDeBusca
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Ex.: competência, DRE, nota fiscal…"
          aria-label="Buscar um termo"
        />
      </div>

      {termos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpenText />}
            title="Nenhum termo encontrado"
            description={`Nada com “${busca.trim()}”. Tente outra palavra, ou abra uma solicitação e pergunte à equipe.`}
          />
        </Card>
      ) : (
        <dl className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
          {termos.map((t) => (
            <div
              key={t.chave}
              id={ancoraDoTermo(t.chave)}
              className="scroll-mt-6 rounded-lg border border-border bg-surface p-4 shadow-[var(--c41-shadow-xs)] target:border-brand target:ring-2 target:ring-brand/30"
            >
              <dt className="text-card-title font-semibold text-fg">{t.termo}</dt>
              {t.explicacao.map((frase) => (
                <dd key={frase} className="mt-1 text-body leading-relaxed text-fg-secondary">
                  {frase}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      )}
      {/* Quantos termos a busca deixou à vista, lido pelo leitor de tela a cada
          mudança — a lista inteira num `aria-live` seria lida toda de novo. */}
      <p className="sr-only" aria-live="polite">
        {termos.length} de {GLOSSARIO_DO_PORTAL.length} termos
      </p>
    </section>
  );
}
