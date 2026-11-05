"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { montarMenuDoSetor, telasDoBloco, type BlocoDoMenu, type EntradaDoMenu, type OrdemDoMenu, type TelaDoMenu } from "@/lib/menuDoSetor";
import type { ActionState } from "@/lib/actionState";

type Props = {
  /** O nome do setor, para o texto. */
  setor: string;
  /** As telas do menu do setor, na ordem do catálogo. */
  telas: TelaDoMenu[];
  ordemInicial: OrdemDoMenu;
  personalizada: boolean;
  /** O banco respondeu — sem a tabela (deploy antes da migration), não dá para salvar. */
  disponivel: boolean;
  salvar: (json: string) => Promise<ActionState>;
  restaurar: () => Promise<ActionState>;
};

/** Troca dois itens de lugar numa lista (cópia). */
function trocar<T>(lista: readonly T[], i: number, j: number): T[] {
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j]!, nova[i]!];
  return nova;
}

/**
 * Organizar menu (05/11/2026, pedido do Kauan): o super admin sobe e desce os
 * grupos e as telas do menu de um setor. Cada clique grava na hora, como os
 * interruptores do menu Geral; se a gravação falha, a lista volta. A lista é a
 * mesma regra do menu (`montarMenuDoSetor`), então o que se vê aqui é o menu.
 *
 * Setas, e não arrastar: dá para fazer só com o teclado e o leitor de tela diz
 * o que mudou.
 */
export function OrganizarMenu({ setor, telas, ordemInicial, personalizada, disponivel, salvar, restaurar }: Props) {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [ordem, setOrdem] = useState<OrdemDoMenu>(ordemInicial);
  const [mexeu, setMexeu] = useState(personalizada);
  const [aviso, setAviso] = useState("");
  const blocos = montarMenuDoSetor(telas, ordem);
  const todasAsTelas = (bs: BlocoDoMenu[]) => bs.flatMap(telasDoBloco).map((t) => t.code);

  function aplicar(nova: OrdemDoMenu, frase: string) {
    const anterior = ordem;
    setOrdem(nova);
    setAviso(frase);
    startTransition(async () => {
      const r = await salvar(JSON.stringify(nova));
      if (r?.error) {
        setOrdem(anterior);
        setAviso("");
        toast.error(r.error);
        return;
      }
      setMexeu(true);
    });
  }

  function moverBloco(i: number, passo: -1 | 1) {
    const nome = nomeDoBloco(blocos[i]!);
    aplicar({ grupos: trocar(blocos.map((b) => b.grupo), i, i + passo), telas: todasAsTelas(blocos) }, `${nome} ${passo < 0 ? "subiu" : "desceu"} no menu de ${setor}.`);
  }

  /** Troca duas telas de lugar (irmãs: do mesmo grupo, ou filhas da mesma mãe). */
  function moverTela(a: TelaDoMenu, b: TelaDoMenu, passo: -1 | 1) {
    const lista = todasAsTelas(blocos);
    aplicar({ grupos: blocos.map((x) => x.grupo), telas: trocar(lista, lista.indexOf(a.code), lista.indexOf(b.code)) }, `${a.label} ${passo < 0 ? "subiu" : "desceu"} no menu de ${setor}.`);
  }

  function voltarAoPadrao() {
    startTransition(async () => {
      const r = await restaurar();
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setOrdem({ grupos: [], telas: [] });
      setMexeu(false);
      setAviso(`O menu de ${setor} voltou à ordem padrão.`);
    });
  }

  const travado = !disponivel || isPending;
  const setas = (rotulo: string, i: number, total: number, mover: (passo: -1 | 1) => void) => (
    <span className="flex shrink-0 items-center gap-1">
      <IconButton size="sm" variant="framed" title={`Subir ${rotulo}`} disabled={travado || i === 0} onClick={() => mover(-1)}>
        <ArrowUp size={14} aria-hidden />
      </IconButton>
      <IconButton size="sm" variant="framed" title={`Descer ${rotulo}`} disabled={travado || i === total - 1} onClick={() => mover(1)}>
        <ArrowDown size={14} aria-hidden />
      </IconButton>
    </span>
  );
  const linhaDaTela = (t: TelaDoMenu, irmas: readonly TelaDoMenu[], i: number, recuo: string) => (
    <li key={t.code} className={`flex items-center gap-3 py-2 pr-3 ${recuo}`}>
      <span aria-hidden className="inline-grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-fg-secondary [&>svg]:size-3.5">
        <ModuleIcon code={t.code} />
      </span>
      <span className="min-w-0 flex-1 truncate text-ui text-fg">{t.label}</span>
      {irmas.length > 1 && setas(t.label, i, irmas.length, (passo) => moverTela(t, irmas[i + passo]!, passo))}
    </li>
  );
  const entrada = (e: EntradaDoMenu, irmas: readonly EntradaDoMenu[], i: number, recuo: string) => (
    <li key={e.tela.code}>
      <ul>
        {linhaDaTela(e.tela, irmas.map((x) => x.tela), i, recuo)}
        {e.filhas.length > 0 && (
          <li>
            {/* O fio passa pelo centro do ícone da mãe, como no menu. */}
            <ul aria-label={`Telas dentro de ${e.tela.label}`} className={`border-l border-border ${recuo === "pl-4" ? "ml-7" : "ml-[3.25rem]"}`}>
              {e.filhas.map((f, j) => linhaDaTela(f, e.filhas, j, "pl-3"))}
            </ul>
          </li>
        )}
      </ul>
    </li>
  );

  return (
    <section aria-labelledby="ordem-do-menu" className="space-y-4">
      <div className="space-y-1.5">
        <h2 id="ordem-do-menu" className="text-card-title font-semibold text-fg">
          Ordem no menu
        </h2>
        <p className="text-body text-fg-secondary">
          A ordem dos grupos e das telas no menu de quem trabalha em {setor}. Só o Super Admin muda, e vale para todos
          do setor.
        </p>
        <p className="text-fs-2 text-fg-muted">
          Uma tela fica sempre no grupo dela, e a que veio de outra fica embaixo da tela de origem. Telas que se ligarem
          depois entram no fim do grupo.
        </p>
      </div>

      {!disponivel && (
        <Aviso tom="atencao">
          A ordem ainda não pode ser salva: falta a atualização do banco desta versão. Até lá, o menu segue a ordem
          padrão.
        </Aviso>
      )}

      {telas.length < 2 ? (
        <p className="text-body text-fg-muted">O menu de {setor} tem {telas.length === 0 ? "nenhuma tela" : "uma tela só"}: não há o que ordenar.</p>
      ) : (
        <ul aria-label={`Menu de ${setor}`} className="border border-border rounded-lg divide-y divide-border overflow-hidden bg-surface">
          {blocos.map((b, i) => (
            <li key={b.grupo}>
              {b.tipo === "solta" ? (
                <ul>{entrada(b.entrada, [b.entrada], 0, "pl-4")}</ul>
              ) : (
                <>
                  <div className="flex items-center gap-3 bg-surface-2 py-2 pl-4 pr-3">
                    <span className="c41-rotulo min-w-0 flex-1 truncate">{b.grupo}</span>
                    <span className="text-micro tabular-nums text-fg-muted">{b.telas} {b.telas === 1 ? "tela" : "telas"}</span>
                  </div>
                  <ul aria-label={`Grupo ${b.grupo}`}>{b.entradas.map((e, j) => entrada(e, b.entradas, j, "pl-10"))}</ul>
                </>
              )}
              {blocos.length > 1 && (
                <div className="flex items-center justify-end gap-2 border-t border-border/60 px-3 py-1.5">
                  <span className="text-fs-1 text-fg-muted">{b.tipo === "grupo" ? `Grupo ${b.grupo}` : b.entrada.tela.label} no menu</span>
                  {setas(b.tipo === "grupo" ? `o grupo ${b.grupo}` : b.entrada.tela.label, i, blocos.length, (passo) => moverBloco(i, passo))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {aviso}
      </p>

      {disponivel && mexeu && (
        <Button variant="ghost" size="sm" onClick={voltarAoPadrao} disabled={isPending}>
          Voltar à ordem padrão
        </Button>
      )}
    </section>
  );
}

function nomeDoBloco(b: BlocoDoMenu): string {
  return b.tipo === "grupo" ? `O grupo ${b.grupo}` : b.entrada.tela.label;
}
