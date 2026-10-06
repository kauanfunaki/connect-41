"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { IconeDaNotificacao } from "@/components/notificacoes/CartaoDeNotificacao";
import { salvarTiposOcultos } from "@/app/(app)/notificacoes/actions";
import { tiposConfiguraveis } from "@/lib/notificacoes/catalogo";

// O que cada aba mostra (05/10/2026): a pessoa desliga tipo a tipo — ex.:
// "Parado sem movimentação" dos Alertas. Padrão = tudo ligado. O desligado não
// aparece no sino nem nas abas e não manda push, mas segue gravado: religar
// traz o histórico de volta. A central e o sino avisam quantos estão ocultos.

const GRUPOS = tiposConfiguraveis();

export function PreferenciasDasAbas({
  aberto,
  onFechar,
  ocultos,
  onSalvo,
}: {
  aberto: boolean;
  onFechar: () => void;
  /** Os tipos desligados hoje. */
  ocultos: string[];
  onSalvo: () => void;
}) {
  return (
    <Modal open={aberto} onClose={onFechar} title="O que cada aba mostra" maxWidth="max-w-2xl">
      {/* Remonta a cada abertura: o rascunho parte sempre do que está gravado. */}
      {aberto && <Formulario ocultos={ocultos} onFechar={onFechar} onSalvo={onSalvo} />}
    </Modal>
  );
}

function Formulario({ ocultos, onFechar, onSalvo }: { ocultos: string[]; onFechar: () => void; onSalvo: () => void }) {
  const [desligados, setDesligados] = useState(() => new Set(ocultos));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, comecar] = useTransition();

  function alternar(tipos: string[], ligar: boolean) {
    setDesligados((atual) => {
      const novo = new Set(atual);
      for (const t of tipos) {
        if (ligar) novo.delete(t);
        else novo.add(t);
      }
      return novo;
    });
  }

  function salvar() {
    setErro(null);
    comecar(async () => {
      const r = await salvarTiposOcultos([...desligados]);
      if (r?.error) return setErro(r.error);
      onSalvo();
      onFechar();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-fg-secondary leading-relaxed">
        Desmarque o que você não quer ver. O tipo desmarcado sai do sino e das abas e não manda aviso no celular, mas continua
        guardado: marque de novo e ele volta, com o que chegou nesse meio-tempo.
      </p>

      {GRUPOS.map((g) => {
        const tipos = g.tipos.map((t) => t.tipo);
        const ligados = tipos.filter((t) => !desligados.has(t)).length;
        return (
          <section key={g.aba} aria-labelledby={`pref-${g.aba}`}>
            <div className="flex items-center justify-between gap-3 border-b border-border pb-1.5 mb-2.5">
              <h3 id={`pref-${g.aba}`} className="text-[11px] font-semibold uppercase tracking-[0.04em] text-fg-muted">
                {g.rotulo} <span className="font-normal normal-case tracking-normal">· {ligados} de {tipos.length}</span>
              </h3>
              <Button size="xs" variant="ghost" onClick={() => alternar(tipos, ligados < tipos.length)}>
                {ligados < tipos.length ? "Marcar todos" : "Desmarcar todos"}
              </Button>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {g.tipos.map((t) => (
                <li key={t.tipo}>
                  <Checkbox
                    id={`pref-tipo-${t.tipo}`}
                    checked={!desligados.has(t.tipo)}
                    onChange={(e) => alternar([t.tipo], e.target.checked)}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <IconeDaNotificacao icone={t.icone} tom={t.tom} tamanho={20} />
                        <span className="text-fg">{t.titulo}</span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {erro && <p className="text-[13px] text-danger">{erro}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-[12px] text-fg-muted">
          {desligados.size === 0 ? "Tudo ligado." : `${desligados.size} tipo${desligados.size === 1 ? "" : "s"} oculto${desligados.size === 1 ? "" : "s"}.`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} loading={salvando}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
