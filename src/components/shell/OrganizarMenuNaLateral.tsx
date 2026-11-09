"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, GripVertical, Lock, SlidersVertical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { restaurarOrdemDoMenuPeloCodigo, salvarOrdemDoMenuPeloCodigo } from "@/app/(app)/admin/setores/ordem-do-menu-actions";
import { telasDoBloco, type BlocoDoMenu, type EntradaDoMenu, type TelaDoMenu } from "@/lib/menuDoSetor";
import { alternarOculta, moverNaLista, moverNoMenu, ordemDosBlocos, type ListaDoMenu } from "@/lib/organizarMenu";

// Organizar no próprio menu (09/11/2026, pedido do Victor; desenho "A ·
// Organizar no próprio menu" do artefato "Organizar menu lateral"). O
// "Organizar menu" saiu do fim da lista — onde levava a Admin › Setores — e
// virou o rodapé da lateral: o menu do setor entra em modo de edição ali
// mesmo, com a alça de pontinhos para arrastar, o olho para esconder sem tirar
// do lugar e "Restaurar padrão" / "Concluir". Grava na mesma ordem do setor
// (`SectorMenuOrder`), só o Super Admin, e vale para todos do setor.
//
// O que fica de fora, de propósito: mudar uma tela de grupo, criar ou
// renomear seção. Os grupos são os temas do catálogo, e a regra do menu
// (`menuDoSetor.ts`) é que a tela fica no grupo dela.

type Tela = TelaDoMenu;

export type OrganizacaoDoMenu = ReturnType<typeof useOrganizarMenu>;

/**
 * O estado do modo de edição. Mora no AppShell porque o aviso (topo da lista)
 * e os botões (rodapé da lateral) ficam em lugares diferentes.
 */
export function useOrganizarMenu({
  setor,
  blocosAtuais,
  blocosPadrao,
  ocultasAtuais,
  fixosNoFim,
}: {
  setor: { code: string; label: string } | null;
  /** O menu como está, já com as telas escondidas (para mostrá-las apagadas). */
  blocosAtuais: BlocoDoMenu<Tela>[];
  /** O menu sem nada escolhido — o "Restaurar padrão". */
  blocosPadrao: BlocoDoMenu<Tela>[];
  ocultasAtuais: string[];
  /** As telas soltas que ficam sempre no fim (Chamados, Certificados): não arrastam. */
  fixosNoFim: readonly string[];
}) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [blocos, setBlocos] = useState(blocosAtuais);
  const [ocultas, setOcultas] = useState(ocultasAtuais);
  const [mudou, setMudou] = useState(false);
  const [padrao, setPadrao] = useState(false);
  const [aviso, setAviso] = useState("");
  const [salvando, startTransition] = useTransition();

  const fixo = (b: BlocoDoMenu<Tela>) => b.tipo === "solta" && fixosNoFim.includes(b.entrada.tela.code);
  const moveis = blocos.filter((b) => !fixo(b));
  const fixos = blocos.filter(fixo);

  function abrir() {
    setBlocos(blocosAtuais);
    setOcultas(ocultasAtuais);
    setMudou(false);
    setPadrao(false);
    setAviso("");
    setAberto(true);
  }

  function mover(lista: ListaDoMenu, de: number, antesDe: number, rotulo: string) {
    if (antesDe === de || antesDe === de + 1) return;
    setBlocos((atual) => {
      const m = atual.filter((b) => !fixo(b));
      const f = atual.filter(fixo);
      return lista.tipo === "blocos" ? [...moverNaLista(m, de, antesDe), ...f] : moverNoMenu(atual, lista, de, antesDe);
    });
    setMudou(true);
    setPadrao(false);
    setAviso(`${rotulo} ${antesDe < de ? "subiu" : "desceu"}.`);
  }

  function esconder(t: Tela) {
    const escondida = !ocultas.includes(t.code);
    setOcultas((o) => alternarOculta(o, t.code));
    setMudou(true);
    setPadrao(false);
    setAviso(escondida ? `${t.label} sai do menu.` : `${t.label} volta ao menu.`);
  }

  function restaurar() {
    setBlocos(blocosPadrao);
    setOcultas([]);
    setMudou(true);
    setPadrao(true);
    setAviso("O menu voltou à ordem padrão, com todas as telas. Conclua para gravar.");
  }

  function concluir() {
    if (!setor || !mudou) {
      setAberto(false);
      return;
    }
    startTransition(async () => {
      const r = padrao
        ? await restaurarOrdemDoMenuPeloCodigo(setor.code)
        : await salvarOrdemDoMenuPeloCodigo(setor.code, JSON.stringify(ordemDosBlocos(blocos, ocultas)));
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setAberto(false);
      toast.success(`Menu de ${setor.label} organizado.`);
    });
  }

  return { aberto, abrir, concluir, restaurar, mover, esconder, moveis, fixos, ocultas, salvando, aviso, setor };
}

/** O que está sendo arrastado e onde vai cair. `lista` é a chave da lista (`chaveDaLista`). */
type Arrasto = { lista: string; de: number; code: string } | null;
type Alvo = { lista: string; antesDe: number } | null;

const chaveDaLista = (l: ListaDoMenu) => (l.tipo === "blocos" ? "blocos" : l.tipo === "grupo" ? `grupo:${l.grupo}` : `filhas:${l.mae}`);

/** O aviso do topo do modo de edição. */
export function AvisoDaOrganizacao({ setor }: { setor: string }) {
  return (
    <div className="mb-2 rounded-lg border border-brand-200 bg-brand-subtle px-3 py-2.5 dark:border-brand-800">
      <p className="flex items-center gap-2 text-ui font-semibold text-brand">
        <SlidersVertical size={15} aria-hidden className="flex-shrink-0" />
        Organizando o menu
      </p>
      <p className="mt-1 text-fs-1 leading-snug text-fg-secondary">
        Segure pelos pontinhos à esquerda e arraste. O olho esconde a tela do menu de {setor} sem tirá-la do lugar.
      </p>
    </div>
  );
}

/**
 * O menu do setor em modo de edição: as mesmas linhas do menu, uma por tela,
 * na ordem em que vão ficar. Cada lista arrasta só dentro dela (os blocos, as
 * telas de um grupo, as filhas de uma tela); a alça também anda com as setas
 * do teclado.
 */
export function MenuEmOrganizacao({ org, itemNoTopo }: { org: OrganizacaoDoMenu; itemNoTopo?: { label: string; icon: React.ReactNode } }) {
  const [arrasto, setArrasto] = useState<Arrasto>(null);
  const [alvo, setAlvo] = useState<Alvo>(null);
  // A alça segurada: a linha só arrasta quando o arrasto começa nela.
  const [presa, setPresa] = useState<string | null>(null);
  const travado = org.salvando;

  const soltar = () => {
    setPresa(null);
    setArrasto(null);
    setAlvo(null);
  };

  /** Os eventos de uma linha que arrasta dentro de `lista`, na posição `i` de `total`. */
  const arrastavel = (lista: ListaDoMenu, i: number, code: string, rotulo: string) => {
    const chave = chaveDaLista(lista);
    const naMesma = arrasto?.lista === chave;
    return {
      draggable: !travado,
      onDragStart: (e: React.DragEvent) => {
        if (presa !== code || travado) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        try {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", code);
        } catch {
          /* alguns navegadores não deixam: o arrasto segue pelo estado */
        }
        setArrasto({ lista: chave, de: i, code });
      },
      onDragEnd: soltar,
      onDragOver: (e: React.DragEvent) => {
        if (!naMesma) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        const antesDe = e.clientY > r.top + r.height / 2 ? i + 1 : i;
        if (alvo?.lista !== chave || alvo.antesDe !== antesDe) setAlvo({ lista: chave, antesDe });
      },
      onDrop: (e: React.DragEvent) => {
        if (!naMesma || !arrasto) return;
        e.preventDefault();
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        org.mover(lista, arrasto.de, e.clientY > r.top + r.height / 2 ? i + 1 : i, rotuloDe(arrasto.code));
        soltar();
      },
      /** A barrinha azul em cima ou embaixo da linha onde o item vai cair. */
      marca: naMesma && arrasto?.code !== code && alvo?.lista === chave
        ? alvo.antesDe === i ? "shadow-[0_-3px_0_0_var(--color-brand)]" : alvo.antesDe === i + 1 ? "shadow-[0_3px_0_0_var(--color-brand)]" : ""
        : "",
      arrastando: arrasto?.code === code,
      alca: (
        <button
          type="button"
          data-alca={code}
          aria-label={`Mover ${rotulo}`}
          title="Segure e arraste, ou use as setas"
          disabled={travado}
          onPointerDown={() => setPresa(code)}
          onPointerUp={() => setPresa(null)}
          onKeyDown={(e) => {
            const passo = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
            if (!passo) return;
            e.preventDefault();
            org.mover(lista, i, passo < 0 ? i - 1 : i + 2, rotulo);
            // A alça continua com o foco depois de a linha mudar de lugar.
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-alca="${CSS.escape(code)}"]`)?.focus());
          }}
          className="grid h-9 w-6 flex-shrink-0 cursor-grab place-items-center rounded-md text-fg-muted transition-colors hover:text-fg active:cursor-grabbing disabled:cursor-default"
        >
          <GripVertical size={15} aria-hidden />
        </button>
      ),
    };
  };

  const rotulos = new Map<string, string>();
  for (const b of [...org.moveis, ...org.fixos]) {
    rotulos.set(`grupo:${b.grupo}`, `O grupo ${b.grupo}`);
    for (const t of telasDoBloco(b)) rotulos.set(t.code, t.label);
  }
  const rotuloDe = (code: string) => rotulos.get(code) ?? code;

  const olho = (t: Tela, apagadaPelaMae: boolean) => {
    const oculta = org.ocultas.includes(t.code);
    return (
      <button
        type="button"
        aria-label={`${oculta ? "Mostrar" : "Esconder"} ${t.label}`}
        aria-pressed={oculta}
        title={apagadaPelaMae && !oculta ? "Escondida junto com a tela de cima" : undefined}
        disabled={travado}
        onClick={() => org.esconder(t)}
        className="grid size-8 flex-shrink-0 place-items-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40"
      >
        {oculta ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
      </button>
    );
  };

  const cadeado = (dica: string) => (
    <span title={dica} className="grid size-8 flex-shrink-0 place-items-center text-fg-muted">
      <Lock size={13} role="img" aria-label={dica} />
    </span>
  );

  /** Uma linha de tela: alça (ou nada), ícone, nome, olho. */
  const linha = (t: Tela, opcoes: { lista?: ListaDoMenu; i?: number; apagadaPelaMae?: boolean; fixa?: string }) => {
    const oculta = org.ocultas.includes(t.code) || !!opcoes.apagadaPelaMae;
    const d = opcoes.lista ? arrastavel(opcoes.lista, opcoes.i!, t.code, t.label) : null;
    return (
      <div
        key={t.code}
        {...(d ? { draggable: d.draggable, onDragStart: d.onDragStart, onDragEnd: d.onDragEnd, onDragOver: d.onDragOver, onDrop: d.onDrop } : {})}
        className={`flex h-9 items-center gap-1.5 rounded-lg border pr-0.5 transition-[opacity,box-shadow] ${
          oculta ? "border-border-soft bg-surface-2" : "border-border bg-surface"
        } ${d?.arrastando ? "opacity-40" : ""} ${d?.marca ?? ""} ${d ? "" : "pl-2"}`}
      >
        {d?.alca}
        <span aria-hidden className={`flex-shrink-0 ${oculta ? "text-fg-muted" : "text-fg-secondary"}`}>
          <ModuleIcon code={t.code} size={15} />
        </span>
        <span className={`min-w-0 flex-1 truncate text-fs-2 ${oculta ? "text-fg-muted" : "text-fg"}`}>{t.label}</span>
        {opcoes.fixa && cadeado(opcoes.fixa)}
        {olho(t, !!opcoes.apagadaPelaMae)}
      </div>
    );
  };

  /** A tela e, recuadas embaixo, as que vieram dela. */
  const entrada = (e: EntradaDoMenu<Tela>, lista: ListaDoMenu | undefined, i: number, fixa?: string) => {
    const maeOculta = org.ocultas.includes(e.tela.code);
    return (
      <li key={e.tela.code} className="space-y-1">
        {linha(e.tela, { lista, i, fixa })}
        {e.filhas.length > 0 && (
          <ul aria-label={`Telas dentro de ${e.tela.label}`} className="ml-3 space-y-1 border-l border-border pl-2">
            {e.filhas.map((f, j) => (
              <li key={f.code}>{linha(f, { lista: e.filhas.length > 1 ? { tipo: "filhas", mae: e.tela.code } : undefined, i: j, apagadaPelaMae: maeOculta })}</li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  const bloco = (b: BlocoDoMenu<Tela>, i: number, fixa?: string) => {
    const lista: ListaDoMenu | undefined = fixa || org.moveis.length < 2 ? undefined : { tipo: "blocos" };
    if (b.tipo === "solta") return <ul key={b.grupo} className="space-y-1">{entrada(b.entrada, lista, i, fixa)}</ul>;
    const d = lista ? arrastavel(lista, i, `grupo:${b.grupo}`, `o grupo ${b.grupo}`) : null;
    return (
      <div key={b.grupo} className={`rounded-lg transition-[opacity,box-shadow] ${d?.arrastando ? "opacity-40" : ""}`}>
        <div
          {...(d ? { draggable: d.draggable, onDragStart: d.onDragStart, onDragEnd: d.onDragEnd, onDragOver: d.onDragOver, onDrop: d.onDrop } : {})}
          className={`flex items-center gap-1.5 rounded-md pt-2.5 pb-1 ${d?.marca ?? ""}`}
        >
          {d?.alca}
          <span className="c41-rotulo min-w-0 flex-1 truncate">{b.grupo}</span>
        </div>
        <ul aria-label={`Grupo ${b.grupo}`} className="space-y-1">
          {b.entradas.map((e, j) => entrada(e, b.entradas.length > 1 ? { tipo: "grupo", grupo: b.grupo } : undefined, j))}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-1.5 pt-1" onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(null); }}>
      {itemNoTopo && (
        <div className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface pl-2 pr-0.5">
          <span aria-hidden className="flex-shrink-0 text-fg-secondary [&>svg]:size-[15px]">{itemNoTopo.icon}</span>
          <span className="min-w-0 flex-1 truncate text-fs-2 text-fg">{itemNoTopo.label}</span>
          {cadeado("Sempre no topo")}
        </div>
      )}
      {org.moveis.map((b, i) => bloco(b, i))}
      {org.fixos.map((b, i) => bloco(b, i, "Fica sempre no fim do menu"))}
      <p role="status" aria-live="polite" className="sr-only">
        {org.aviso}
      </p>
    </div>
  );
}

/** O rodapé da lateral: o botão que abre o modo de edição, ou os dois que o fecham. */
export function RodapeDaOrganizacao({ org }: { org: OrganizacaoDoMenu }) {
  if (!org.aberto) {
    return (
      <div className="flex-shrink-0 border-t border-border p-2.5">
        <button
          type="button"
          onClick={org.abrir}
          className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-ui font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <SlidersVertical size={16} aria-hidden className="flex-shrink-0" />
          Organizar menu
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-shrink-0 gap-2 border-t border-border p-2.5">
      <Button variant="secondary" size="sm" className="shrink-0 whitespace-nowrap px-2.5" onClick={org.restaurar} disabled={org.salvando}>
        Restaurar padrão
      </Button>
      <Button variant="primary" size="sm" className="min-w-0 flex-1" onClick={org.concluir} loading={org.salvando}>
        Concluir
      </Button>
    </div>
  );
}
