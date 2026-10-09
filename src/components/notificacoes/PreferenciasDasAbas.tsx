"use client";

import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { IconeDaNotificacao } from "@/components/notificacoes/CartaoDeNotificacao";
import { salvarTiposOcultos } from "@/app/(app)/notificacoes/actions";
import { tiposConfiguraveis } from "@/lib/notificacoes/catalogo";
import { contagemDoBloco } from "@/lib/listaEmBlocos";

// O que cada aba mostra (05/10/2026): a pessoa desliga tipo a tipo — ex.:
// "Parado sem movimentação" dos Alertas. Padrão = tudo ligado. O desligado não
// aparece no sino nem nas abas e não manda push, mas segue gravado: religar
// traz o histórico de volta. A central e o sino avisam quantos estão ocultos.
//
// Escolha "Notificações A" do Kauan (08/10/2026): eram 39 caixas abertas, com
// "Marcar todos" por grupo. Agora um interruptor por tipo e um no cabeçalho de
// cada grupo, que liga ou desliga o grupo todo; os grupos começam fechados,
// com "7 de 8 ligados" na linha. O que vai para a action não mudou.

const GRUPOS = tiposConfiguraveis();
const LIGADOS = { um: "ligado", varios: "ligados" };

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
    <Modal open={aberto} onClose={onFechar} title="O que cada aba mostra" maxWidth="max-w-lg">
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
    <div className="flex flex-col gap-4">
      <p className="text-fs-3 text-fg-secondary leading-relaxed">
        Desligue o que você não quer ver. O tipo desligado sai do sino e das abas e não manda aviso no celular, mas continua
        guardado: ligue de novo e ele volta, com o que chegou nesse meio-tempo.
      </p>

      <div className="space-y-2">
        {GRUPOS.map((g) => {
          const tipos = g.tipos.map((t) => t.tipo);
          const ligados = tipos.filter((t) => !desligados.has(t)).length;
          return (
            <BlocoRecolhivel
              key={g.aba}
              titulo={g.rotulo}
              resumo={contagemDoBloco(ligados, tipos.length, LIGADOS)}
              // Ligado quando o grupo todo está ligado; com algum desligado, o
              // toque liga todos — e, com todos ligados, desliga todos.
              acao={
                <Switch
                  checked={ligados === tipos.length}
                  onCheckedChange={(ligar) => alternar(tipos, ligar)}
                  aria-label={`Todos os tipos de ${g.rotulo}`}
                />
              }
            >
              <ul className="flex flex-col gap-1">
                {g.tipos.map((t) => {
                  const id = `pref-tipo-${t.tipo}`;
                  return (
                    <li key={t.tipo} className="flex items-center justify-between gap-3 py-1">
                      {/* O rótulo é do interruptor: clicar no nome também liga e desliga. */}
                      <label htmlFor={id} className="inline-flex min-w-0 cursor-pointer items-center gap-2 text-label text-fg">
                        <IconeDaNotificacao icone={t.icone} tom={t.tom} tamanho={20} />
                        <span className="min-w-0">{t.titulo}</span>
                      </label>
                      <Switch id={id} checked={!desligados.has(t.tipo)} onCheckedChange={(ligar) => alternar([t.tipo], ligar)} />
                    </li>
                  );
                })}
              </ul>
            </BlocoRecolhivel>
          );
        })}
      </div>

      {erro && <p className="text-fs-3 text-danger">{erro}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-fs-2 text-fg-muted">
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
