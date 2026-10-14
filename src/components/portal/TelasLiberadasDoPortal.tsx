"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import type { GrupoDeTelas, TelaParaLiberar } from "@/lib/portal/telasLiberadas";

type Resultado = { ok: true } | { erro: string };

type Props = {
  grupos: GrupoDeTelas[];
  /** `definirTelaDoPortal`, que confere de novo o papel e o escritório. */
  definirAction: (href: string, liberada: boolean) => Promise<Resultado>;
  /** A gravação não está disponível (sem a tabela, ou o banco recusou a leitura): a lista só mostra. */
  somenteLeitura?: boolean;
};

/**
 * Telas liberadas no portal (14/10/2026), em Administração › Portal do
 * cliente. Pedido do Kauan: o portal vai para os primeiros clientes antes de
 * toda tela estar validada, e o escritório libera as telas conforme testa.
 *
 * Um interruptor por tela, agrupado como no menu do portal. A troca vale na
 * hora (sem "Salvar") e para todos os clientes do escritório; o aviso que some
 * sozinho diz o que aconteceu, e um erro volta o interruptor para onde estava.
 */
export function TelasLiberadasDoPortal({ grupos, definirAction, somenteLeitura = false }: Props) {
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  // O que a pessoa acabou de trocar, até a página voltar do servidor com o
  // mesmo valor. Fica depois do sucesso: é o valor que o servidor gravou.
  const [trocadas, setTrocadas] = useState<Record<string, boolean>>({});
  const liberadaAgora = (t: TelaParaLiberar) => trocadas[t.href] ?? t.liberada;

  function trocar(t: TelaParaLiberar, liberada: boolean) {
    const antes = liberadaAgora(t);
    setTrocadas((atual) => ({ ...atual, [t.href]: liberada }));
    startTransition(async () => {
      const r = await definirAction(t.href, liberada).catch(() => ({ erro: "Não foi possível salvar agora. Tente de novo em instantes." }));
      if ("erro" in r) {
        setTrocadas((atual) => ({ ...atual, [t.href]: antes }));
        toast.error(r.erro);
        return;
      }
      toast.success(liberada ? `${t.rotulo} liberada no portal.` : `${t.rotulo} bloqueada no portal.`);
    });
  }

  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <section key={g.chave} aria-labelledby={`telas-${g.chave}`}>
          <h2 id={`telas-${g.chave}`} className="mb-2 text-card-title font-semibold text-fg">
            {g.titulo}
          </h2>
          <Card className="divide-y divide-border">
            {g.telas.map((t) => (
              <LinhaDaTela
                key={t.href}
                t={t}
                liberada={liberadaAgora(t)}
                desligado={somenteLeitura || pendente}
                onTrocar={(liberada) => trocar(t, liberada)}
              />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function LinhaDaTela({
  t,
  liberada,
  desligado,
  onTrocar,
}: {
  t: TelaParaLiberar;
  liberada: boolean;
  desligado: boolean;
  onTrocar: (liberada: boolean) => void;
}) {
  const idDaDescricao = `tela-${t.href.replaceAll("/", "-")}`;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1 basis-64" id={idDaDescricao}>
        <p className="text-fs-3 text-fg">{t.rotulo}</p>
        <p className="text-fs-1 text-fg-muted">{t.descricao}</p>
        {t.foraDoMenu && <p className="text-fs-1 text-fg-muted mt-0.5">{t.foraDoMenu}</p>}
        {!liberada && t.avisoAoBloquear && (
          <Aviso tom="atencao" className="mt-1.5">
            {t.avisoAoBloquear}
          </Aviso>
        )}
      </div>
      <div className="flex-shrink-0 pt-0.5">
        {t.bloqueavel ? (
          <Switch
            checked={liberada}
            onCheckedChange={onTrocar}
            disabled={desligado}
            rotulo={liberada ? "Liberada" : "Bloqueada"}
            aria-label={`${t.rotulo} liberada no portal`}
            aria-describedby={idDaDescricao}
          />
        ) : (
          <Selo tom="sucesso">Sempre liberada</Selo>
        )}
      </div>
    </div>
  );
}
