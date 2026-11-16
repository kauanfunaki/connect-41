"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FilterButtonSection } from "@/components/ui/FilterButton";
import { Popover } from "@/components/ui/Popover";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { criarFilaDeGravacao } from "@/components/tarefas/filaDeGravacao";
import { TASK_WIDGETS, type TaskWidgetGrupo, type TaskWidgetKey } from "@/lib/taskWidgets";
import type { ActionState } from "@/lib/actionState";

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

/** Os interruptores em dois grupos (10/11/2026): o que entra nas listas e os blocos ao lado. */
const GRUPOS: { grupo: TaskWidgetGrupo; titulo: string }[] = [
  { grupo: "origem", titulo: "Nas listas" },
  { grupo: "bloco", titulo: "Ao lado" },
];

/** A troca que ainda está indo para o servidor, por alvo (a chave é a do `chaveDo`). */
type Trocas = Record<string, TaskWidgetKey[]>;
const SEM_TROCA: Trocas = {};

// Configuração da tela /tarefas.
//
// Na própria tela desde 20/10/2026 (escolha 11A dos Ajustes de 15/10, a mesma
// do Início). Desde 28/10/2026 não é mais só do Super Admin, nem só por setor
// (decisão do Kauan): cada pessoa personaliza o seu, o coordenador configura o
// da equipe e Admin e Super Admin, o de qualquer um e o padrão de cada setor —
// o "Para quem" escolhe. Desde 10/11/2026 o coordenador também configura o
// padrão dos setores dele, e tudo o que a tela monta desliga: as origens das
// listas e os blocos ao lado. Sem ordem: a do catálogo.
//
// Desde 16/11/2026 (melhoria-714, alternativa A escolhida pelo Kauan) é um
// painel no próprio botão, no desenho do painel de Filtros, e não mais a faixa
// azul embaixo do título, que empurrava a página e juntava título, frase,
// três botões e os interruptores. Cada interruptor vale na hora: saíram o
// "Concluir" e o "Cancelar". É o `Popover`, e não o `Dropdown` do Filtros: no
// celular as ações do cabeçalho descem para a esquerda, e o `Dropdown`, preso
// ao botão, sairia da tela; o `Popover` se ajusta à tela e, no celular, abre
// como folha embaixo.
export function ConfigurarTarefasButton({ alvos, salvarPessoa, restaurarPessoa, salvarSetor, restaurarSetor }: Props) {
  const [chave, setChave] = useState(() => (alvos[0] ? chaveDo(alvos[0]) : ""));
  const alvo = alvos.find((a) => chaveDo(a) === chave) ?? alvos[0];
  // O interruptor muda na hora (otimista) e a gravação segue atrás. O que vale
  // é o que a página manda (`alvo.blocos`): terminada a gravação, a troca sai
  // daqui e fica o gravado — no erro, o interruptor volta sozinho.
  const [trocas, mostrar] = useOptimistic(SEM_TROCA, (atuais: Trocas, t: { chave: string; blocos: TaskWidgetKey[] }) => ({
    ...atuais,
    [t.chave]: t.blocos,
  }));
  const [restaurando, marcarRestaurando] = useOptimistic(false);
  const [, iniciar] = useTransition();
  // Uma fila por alvo: a action grava o conjunto inteiro, e duas gravações
  // cruzadas do mesmo alvo deixariam o conjunto errado (ver `filaDeGravacao`).
  const filas = useRef(new Map<string, ReturnType<typeof criarFilaDeGravacao>>());
  const toast = useToast();

  if (!alvo) return null;

  const chaveDoAlvo = chaveDo(alvo);
  const blocos = trocas[chaveDoAlvo] ?? alvo.blocos;

  const filaDo = (qual: string) => {
    let fila = filas.current.get(qual);
    if (!fila) {
      fila = criarFilaDeGravacao();
      filas.current.set(qual, fila);
    }
    return fila;
  };

  const trocar = (key: TaskWidgetKey, ligado: boolean) => {
    // As actions gravam o conjunto inteiro: vai o de agora com a troca.
    const proximo = TASK_WIDGETS.filter((w) => (w.key === key ? ligado : blocos.includes(w.key))).map((w) => w.key);
    const pedido = alvo.tipo === "setor" ? () => salvarSetor(alvo.code, proximo) : () => salvarPessoa(alvo.id, proximo);
    iniciar(async () => {
      mostrar({ chave: chaveDoAlvo, blocos: proximo });
      const fim = await filaDo(chaveDoAlvo)(pedido);
      if (!fim.ok && fim.erro) toast.error(fim.erro);
    });
  };

  const restaurar = () => {
    const pedido = alvo.tipo === "setor" ? () => restaurarSetor(alvo.code) : () => restaurarPessoa(alvo.id);
    const sucesso =
      alvo.tipo === "setor"
        ? `${alvo.rotulo} voltou ao padrão.`
        : alvo.eu
          ? "Seu Meu dia voltou ao padrão do setor."
          : `${alvo.rotulo} voltou ao padrão do setor.`;
    iniciar(async () => {
      // Trava os interruptores: a troca feita agora partiria do conjunto que
      // está sendo apagado.
      marcarRestaurando(true);
      const fim = await filaDo(chaveDoAlvo)(pedido);
      if (fim.ok) toast.success(sucesso);
      else if (fim.erro) toast.error(fim.erro);
    });
  };

  return (
    <Popover
      align="right"
      width={280}
      folhaNoCelular
      aria-label="Configurar o Meu dia"
      trigger={({ open, toggle }) => (
        // Contorno sem fundo em repouso e em `sm`, a altura do "Todas as
        // tarefas" ao lado (15/10/2026); com o painel aberto, fica marcado.
        <Button
          variant="secondary"
          size="sm"
          onClick={toggle}
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Configurar o Meu dia"
          aria-label="Configurar o Meu dia"
          className="aria-expanded:bg-surface-hover"
        >
          <SlidersHorizontal size={14} />
          <span className="hidden sm:inline">Configurar</span>
        </Button>
      )}
    >
      {({ close }) => (
        <PainelDoMeuDia
          alvos={alvos}
          alvo={alvo}
          blocos={blocos}
          restaurando={restaurando}
          onEscolher={setChave}
          onTrocar={trocar}
          // Voltar ao padrão fecha o painel, como fechava a faixa: o botão
          // desabilita em seguida (não há mais o que desfazer) e o foco, que
          // estava nele, volta para o "Configurar".
          onRestaurar={() => {
            close();
            restaurar();
          }}
        />
      )}
    </Popover>
  );
}

/**
 * O conteúdo do painel, de cima para baixo: para quem (só com mais de um
 * alvo), os dois grupos de interruptores e, no pé, a volta ao padrão. No
 * desenho do painel de Filtros: rótulo em caixa alta e um controle por linha.
 */
export function PainelDoMeuDia({
  alvos,
  alvo,
  blocos,
  restaurando,
  onEscolher,
  onTrocar,
  onRestaurar,
}: {
  alvos: AlvoDoMeuDia[];
  alvo: AlvoDoMeuDia;
  blocos: TaskWidgetKey[];
  restaurando: boolean;
  onEscolher: (chave: string) => void;
  onTrocar: (key: TaskWidgetKey, ligado: boolean) => void;
  onRestaurar: () => void;
}) {
  const eu = alvos.filter((a) => a.tipo === "pessoa" && a.eu);
  const equipe = alvos.filter((a) => a.tipo === "pessoa" && !a.eu);
  const setores = alvos.filter((a) => a.tipo === "setor");
  const temOQueRestaurar = alvo.tipo === "setor" || alvo.proprio;

  return (
    <div className="flex flex-col gap-3">
      {/* Em tela baixa quem rola é esta parte, e o pé fica à vista. A folga
          (`p-1 -m-1`) é do anel de foco, que a rolagem cortaria. */}
      <div className="scroll-y -m-1 flex max-h-[60dvh] flex-col gap-3 overflow-y-auto p-1">
        {alvos.length > 1 && (
          <FilterButtonSection label="Para quem">
            <Select compact value={chaveDo(alvo)} onChange={(e) => onEscolher(e.target.value)} aria-label="Para quem" className="w-full">
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
          </FilterButtonSection>
        )}
        {GRUPOS.map((g) => (
          <div key={g.grupo} role="group" aria-label={g.titulo}>
            <FilterButtonSection label={g.titulo}>
              <div className="flex flex-col">
                {TASK_WIDGETS.filter((def) => def.grupo === g.grupo).map((def) => (
                  <div key={def.key} title={def.description}>
                    {/* O nome à esquerda e o interruptor à direita; a linha
                        inteira alterna, e no toque ela é mais alta. */}
                    <Switch
                      checked={blocos.includes(def.key)}
                      onCheckedChange={(ligado) => onTrocar(def.key, ligado)}
                      disabled={restaurando}
                      rotulo={def.label}
                      className="w-full flex-row-reverse justify-between px-1 py-1.5 [@media(pointer:coarse)]:py-2.5"
                    />
                  </div>
                ))}
              </div>
            </FilterButtonSection>
          </div>
        ))}
      </div>
      <div className="border-t border-border pt-2">
        <Button variant="ghost" size="sm" onClick={onRestaurar} disabled={!temOQueRestaurar || restaurando} className="-ml-2">
          <RotateCcw size={13} /> {alvo.tipo === "setor" ? "Restaurar padrão" : "Voltar ao padrão do setor"}
        </Button>
      </div>
    </div>
  );
}
