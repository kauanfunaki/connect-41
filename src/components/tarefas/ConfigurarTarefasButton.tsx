"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { TASK_WIDGETS, type TaskWidgetKey } from "@/lib/taskWidgets";
import type { ActionState } from "@/lib/actionState";

const semAssinatura = () => () => {};

/** O lugar da faixa de edição, logo abaixo do cabeçalho do Meu dia. */
export const ID_DA_FAIXA_DO_MEU_DIA = "faixa-do-meu-dia";

/**
 * De quem é o Meu dia que se configura (28/10/2026): o próprio, o de alguém da
 * equipe ou o padrão de um setor. `blocos` é o que essa pessoa ou esse setor vê
 * hoje; `proprio` diz se a pessoa já tem configuração dela (só aí o "Voltar ao
 * padrão" tem o que desfazer).
 */
export type AlvoDoMeuDia =
  | { tipo: "pessoa"; id: string; rotulo: string; eu: boolean; blocos: TaskWidgetKey[]; proprio: boolean }
  | { tipo: "setor"; code: string; rotulo: string; blocos: TaskWidgetKey[] };

type Props = {
  alvos: AlvoDoMeuDia[];
  salvarPessoa: (userId: string, keys: TaskWidgetKey[]) => Promise<ActionState>;
  restaurarPessoa: (userId: string) => Promise<ActionState>;
  salvarSetor: (sectorCode: string, keys: TaskWidgetKey[]) => Promise<ActionState>;
  restaurarSetor: (sectorCode: string) => Promise<ActionState>;
};

const chaveDo = (a: AlvoDoMeuDia) => (a.tipo === "pessoa" ? `p:${a.id}` : `s:${a.code}`);

// Configuração da tela /tarefas.
//
// Na própria tela desde 20/10/2026 (escolha 11A dos Ajustes de 15/10, a mesma
// do Início): o botão abre uma faixa no topo do Meu dia, um interruptor por
// bloco e Concluir. Desde 28/10/2026 não é mais só do Super Admin, nem só por
// setor (decisão do Kauan): cada pessoa personaliza o seu, o coordenador
// configura o da equipe e Admin e Super Admin, o de qualquer um e o padrão de
// cada setor — o "Para quem" escolhe. Sem ordem: a do catálogo.
export function ConfigurarTarefasButton({ alvos, salvarPessoa, restaurarPessoa, salvarSetor, restaurarSetor }: Props) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState(() => (alvos[0] ? chaveDo(alvos[0]) : ""));
  const alvo = alvos.find((a) => chaveDo(a) === chave) ?? alvos[0];
  const [selected, setSelected] = useState<TaskWidgetKey[]>(() => alvo?.blocos ?? []);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  // A faixa vai para o lugar dela na página, abaixo do cabeçalho; o botão
  // fica no cabeçalho. No servidor não há documento (o padrão do SlideOver).
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);
  const lugar = noNavegador && aberto ? document.getElementById(ID_DA_FAIXA_DO_MEU_DIA) : null;

  function escolher(nova: string) {
    setChave(nova);
    setSelected(alvos.find((a) => chaveDo(a) === nova)?.blocos ?? []);
  }

  function abrir() {
    // Reabrir depois de cancelar não pode manter o rascunho descartado.
    escolher(chave || (alvos[0] ? chaveDo(alvos[0]) : ""));
    setAberto(true);
  }

  function toggle(key: TaskWidgetKey) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function executar(acao: () => Promise<ActionState>, sucesso: string) {
    startTransition(async () => {
      const result = await acao();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setAberto(false);
      toast.success(sucesso);
    });
  }

  function save() {
    if (!alvo) return;
    if (alvo.tipo === "setor") executar(() => salvarSetor(alvo.code, selected), `Padrão do Meu dia de ${alvo.rotulo} salvo.`);
    else executar(() => salvarPessoa(alvo.id, selected), alvo.eu ? "Seu Meu dia foi salvo." : `Meu dia de ${alvo.rotulo} salvo.`);
  }

  function reset() {
    if (!alvo) return;
    if (alvo.tipo === "setor") executar(() => restaurarSetor(alvo.code), `${alvo.rotulo} voltou ao padrão.`);
    else executar(() => restaurarPessoa(alvo.id), alvo.eu ? "Seu Meu dia voltou ao padrão do setor." : `${alvo.rotulo} voltou ao padrão do setor.`);
  }

  if (!alvo) return null;

  const eu = alvos.filter((a) => a.tipo === "pessoa" && a.eu);
  const equipe = alvos.filter((a) => a.tipo === "pessoa" && !a.eu);
  const setores = alvos.filter((a) => a.tipo === "setor");
  const temOQueRestaurar = alvo.tipo === "setor" || alvo.proprio;
  const explicacao =
    alvo.tipo === "setor"
      ? "O padrão de quem é do setor e não tem configuração própria — quem participa de mais de um vê a soma dos blocos."
      : alvo.eu
        ? "Só para você. Vale mais que o padrão do setor; o coordenador também pode ajustar o seu."
        : `Só para ${alvo.rotulo}. Vale mais que o padrão do setor, e a pessoa também pode ajustar.`;

  const faixa = (
    <div
      role="region"
      aria-label="Configurando o Meu dia"
      className="sticky top-2 z-20 mb-4 flex flex-col gap-3 rounded-lg border border-brand/30 bg-brand-subtle px-4 py-3 shadow-[var(--c41-shadow-sm)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SlidersHorizontal size={16} className="flex-shrink-0 text-brand" aria-hidden />
        <p className="font-semibold text-fg">Configurando o Meu dia de</p>
        {alvos.length > 1 ? (
          <Select compact value={chave} onChange={(e) => escolher(e.target.value)} aria-label="Para quem" className="w-60 max-w-full">
            {eu.map((a) => (
              <option key={chaveDo(a)} value={chaveDo(a)}>
                Você
              </option>
            ))}
            {equipe.length > 0 && (
              <optgroup label="Equipe">
                {equipe.map((a) => (
                  <option key={chaveDo(a)} value={chaveDo(a)}>
                    {a.rotulo}
                  </option>
                ))}
              </optgroup>
            )}
            {setores.length > 0 && (
              <optgroup label="Padrão do setor">
                {setores.map((a) => (
                  <option key={chaveDo(a)} value={chaveDo(a)}>
                    {a.rotulo}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        ) : (
          <p className="font-semibold text-fg">você</p>
        )}
        <p className="min-w-0 text-fs-2 text-fg-secondary">{explicacao}</p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {temOQueRestaurar && (
            <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
              <RotateCcw size={13} /> {alvo.tipo === "setor" ? "Restaurar padrão" : "Voltar ao padrão do setor"}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setAberto(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} loading={isPending} loadingLabel="Salvando…">
            <Check size={13} /> Concluir
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {TASK_WIDGETS.map((def) => (
          <span key={def.key} title={def.description} className="inline-flex">
            <Switch checked={selected.includes(def.key)} onCheckedChange={() => toggle(def.key)} rotulo={def.label} />
          </span>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="text-fs-2 text-warning-fg">
          Sem nenhum bloco ligado, este Meu dia abre numa tela vazia. É uma escolha válida — só não é acidente.
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* Contorno sem fundo em repouso e em `sm`, a altura do "Todas as
          tarefas" ao lado (15/10/2026). */}
      <Button
        variant="secondary"
        size="sm"
        onClick={aberto ? () => setAberto(false) : abrir}
        aria-pressed={aberto}
        title="Configurar o Meu dia"
        aria-label="Configurar o Meu dia"
      >
        <SlidersHorizontal size={14} />
        <span className="hidden sm:inline">Configurar</span>
      </Button>
      {lugar && createPortal(faixa, lugar)}
    </>
  );
}
