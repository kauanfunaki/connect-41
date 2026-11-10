"use client";

import { useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { alternarFonte, type AgendaDoSetorNaTela } from "@/lib/agendaDoSetor";
import type { FonteDaAgenda } from "@/lib/fontesDaAgenda";
import type { ActionState } from "@/lib/actionState";
import { BotoesDeFonte } from "./BotoesDeFonte";

type Props = {
  /** Os setores que quem abre a tela configura (o coordenador, os dele; o admin, todos). */
  setores: AgendaDoSetorNaTela[];
  /** As fontes que existem no escritório (módulo ligado). */
  fontes: FonteDaAgenda[];
  /** As tabelas existem — sem a migration, não dá para salvar. */
  disponivel: boolean;
  salvar: (sectorCode: string, dados: { usaReunioes: boolean; fontesOcultas: string[] }) => Promise<ActionState>;
  restaurar: (sectorCode: string) => Promise<ActionState>;
};

/**
 * A Agenda de um setor (10/11/2026, pedido do Kauan): se o setor usa reuniões
 * e as fontes de prazo que a Agenda mostra por padrão. Fica em Sua conta ›
 * Agenda do setor (para o coordenador, que não abre Setores e módulos) e em
 * Setores e módulos (para o administrador, no setor escolhido). Salva no
 * botão, como o formulário do horário: são duas escolhas que valem para o
 * setor inteiro, e um clique por engano não deve mudar a tela de ninguém.
 */
export function AgendaDoSetorForm({ setores, fontes, disponivel, salvar, restaurar }: Props) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [code, setCode] = useState(setores[0]?.code ?? "");
  const setor = setores.find((s) => s.code === code) ?? setores[0];
  const [usa, setUsa] = useState(setor?.usaReunioes ?? true);
  const [ocultas, setOcultas] = useState<FonteDaAgenda[]>(setor?.fontesOcultas ?? []);

  if (!setor) return null;

  function escolher(novo: string) {
    const s = setores.find((x) => x.code === novo);
    if (!s) return;
    setCode(s.code);
    setUsa(s.usaReunioes);
    setOcultas(s.fontesOcultas);
  }

  function enviar() {
    startTransition(async () => {
      const r = await salvar(setor.code, { usaReunioes: usa, fontesOcultas: ocultas });
      if (r?.error) toast.error(r.error);
      else toast.success(`A Agenda de ${setor.rotulo} foi salva.`);
    });
  }

  function voltarAoPadrao() {
    startTransition(async () => {
      const r = await restaurar(setor.code);
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setUsa(true);
      setOcultas([]);
      toast.success(`A Agenda de ${setor.rotulo} voltou ao padrão: usa reuniões e mostra todas as fontes.`);
    });
  }

  const mudou = usa !== setor.usaReunioes || ocultas.join() !== setor.fontesOcultas.join();
  const todasDesligadas = fontes.length > 0 && fontes.every((f) => ocultas.includes(f));

  return (
    <div className="space-y-5">
      {!disponivel && (
        <Aviso tom="atencao">
          Ainda não dá para salvar: falta a atualização do banco desta versão. Até lá, todo setor usa reuniões e vê todas
          as fontes.
        </Aviso>
      )}

      {setores.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="agenda-do-setor" className="text-fs-3 font-medium text-fg">
            Setor
          </label>
          <Select id="agenda-do-setor" compact value={setor.code} onChange={(e) => escolher(e.target.value)} className="w-60 max-w-full">
            {setores.map((s) => (
              <option key={s.code} value={s.code}>
                {s.rotulo}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Switch checked={usa} onCheckedChange={setUsa} disabled={!disponivel || isPending} rotulo={`${setor.rotulo} usa reuniões`} />
        <p className="text-fs-2 text-fg-muted">
          Desligado, a Agenda de quem é do setor abre em Prazos, sem convite para marcar reunião, e o Meu dia começa sem
          “Próximas reuniões”. Cada pessoa ainda pode abrir a Semana e ligar o bloco no Meu dia dela.
        </p>
      </div>

      <div className="space-y-2">
        <p id="fontes-padrao-da-agenda" className="text-fs-3 font-medium text-fg">
          Fontes padrão da Agenda
        </p>
        {fontes.length === 0 ? (
          <p className="text-fs-2 text-fg-muted">Nenhuma fonte de prazo neste escritório além das atividades dos Quadros.</p>
        ) : (
          <BotoesDeFonte
            rotulo="Fontes padrão da Agenda"
            acessiveis={fontes}
            ocultas={ocultas}
            desabilitado={!disponivel || isPending}
            onAlternar={(fonte, ligada) => setOcultas((atual) => alternarFonte(atual, fonte, ligada))}
          />
        )}
        <p className="text-fs-2 text-fg-muted">
          Valem para quem é do setor e nunca escolheu as próprias. Quem está em mais de um setor vê a soma; cada fonte só
          aparece para quem abre a tela de onde ela vem.
        </p>
        {todasDesligadas && (
          <p className="text-fs-2 text-warning-fg">Com todas as fontes desligadas, a Agenda do setor abre sem prazos.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={enviar} disabled={!disponivel || !mudou} loading={isPending} loadingLabel="Salvando…">
          Salvar
        </Button>
        {setor.personalizado && (
          <Button variant="ghost" onClick={voltarAoPadrao} disabled={!disponivel || isPending}>
            <RotateCcw size={13} /> Restaurar padrão
          </Button>
        )}
      </div>
    </div>
  );
}
