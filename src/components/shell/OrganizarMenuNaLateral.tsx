"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, GripVertical, Lock, SlidersVertical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { restaurarOrdemDoMenuPeloCodigo, salvarOrdemDoMenuPeloCodigo } from "@/app/(app)/admin/setores/ordem-do-menu-actions";
import { pelaOrdem, type BlocoDoMenu, type EntradaDoMenu, type TelaDoMenu } from "@/lib/menuDoSetor";
import { alternarOculta, moverNaLista, moverNoMenu, ordemDosBlocos, type ListaDoMenu } from "@/lib/organizarMenu";

// Organizar no próprio menu (09/11/2026, pedido do Victor; desenho "A ·
// Organizar no próprio menu" do artefato "Organizar menu lateral"). O
// "Organizar menu" saiu do fim da lista — onde levava a Admin › Setores — e
// virou o rodapé da lateral: o menu entra em modo de edição ali mesmo, com a
// alça de pontinhos para arrastar, o olho para esconder sem tirar do lugar e
// "Restaurar padrão" / "Concluir". Grava na mesma ordem do setor
// (`SectorMenuOrder`), só o Super Admin, e vale para todos do setor.
//
// - O Geral entra também: muda de ordem só dentro dele, e o olho tira o item
//   do Geral deste setor. Configurações › Setores segue decidindo o que o
//   setor tem; o olho só esconde do menu.
// - Dentro de cada menu (as abas com entrada no menu e as telas do Apoio) o
//   olho também esconde, só ali.
// - As telas do setor mudam de ordem dentro da lista delas (os blocos, as
//   telas de um grupo, as filhas de uma tela). Mudar uma tela de grupo, criar
//   ou renomear seção ficam de fora: os grupos são os temas do catálogo, e a
//   regra do menu (`menuDoSetor.ts`) é que a tela fica no grupo dela.
// - O arrasto é por eventos de ponteiro, e não o arrastar e soltar nativo do
//   HTML: o nativo não pegava nas linhas com botão dentro, e não funciona com
//   toque. Com o mouse, qualquer ponto da linha segura (menos o olho); no toque,
//   só a alça, para o dedo ainda rolar o menu.

type Tela = TelaDoMenu;

/** Uma tela de dentro de um menu que não é tela do catálogo (Robôs, Sites… ou as do Apoio). */
export type ItemDentro = { chave: string; label: string; icon: React.ReactNode };

/** Um item do Geral no organizador: a chave de `CHAVES_DO_GERAL`, o nome, o ícone e, no Apoio, as telas de dentro. */
export type ItemDoGeral = { chave: string; label: string; icon: React.ReactNode; filhos?: ItemDentro[] };

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
  dentroAtual,
  ocultasGeralAtual,
  ocultasDentroAtual,
  geralAtual,
  geralPadrao,
}: {
  setor: { code: string; label: string } | null;
  /** O menu como está, já com as telas escondidas (para mostrá-las apagadas). */
  blocosAtuais: BlocoDoMenu<Tela>[];
  /** O menu sem nada escolhido — o "Restaurar padrão". */
  blocosPadrao: BlocoDoMenu<Tela>[];
  ocultasAtuais: string[];
  /** A ordem escolhida do que fica dentro de cada menu. */
  dentroAtual: Record<string, string[]>;
  /** Os itens do Geral escondidos pelo olho. */
  ocultasGeralAtual: string[];
  /** O que está escondido dentro de cada menu (abas e telas do Apoio). */
  ocultasDentroAtual: Record<string, string[]>;
  /** Os itens do Geral na ordem em que aparecem. */
  geralAtual: ItemDoGeral[];
  /** Os itens do Geral na ordem de sempre (cores juntas). */
  geralPadrao: ItemDoGeral[];
}) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [blocos, setBlocos] = useState(blocosAtuais);
  const [ocultas, setOcultas] = useState(ocultasAtuais);
  const [geral, setGeral] = useState(geralAtual);
  const [dentro, setDentro] = useState(dentroAtual);
  const [ocultasGeral, setOcultasGeral] = useState(ocultasGeralAtual);
  const [ocultasDentro, setOcultasDentro] = useState(ocultasDentroAtual);
  const [mudou, setMudou] = useState(false);
  const [padrao, setPadrao] = useState(false);
  const [aviso, setAviso] = useState("");
  const [salvando, startTransition] = useTransition();

  function abrir() {
    setBlocos(blocosAtuais);
    setOcultas(ocultasAtuais);
    setGeral(geralAtual);
    setDentro(dentroAtual);
    setOcultasGeral(ocultasGeralAtual);
    setOcultasDentro(ocultasDentroAtual);
    setMudou(false);
    setPadrao(false);
    setAviso("");
    setAberto(true);
  }

  function mover(lista: ListaDoMenu, de: number, antesDe: number, rotulo: string) {
    if (antesDe === de || antesDe === de + 1) return;
    if (lista.tipo === "geral") setGeral((g) => moverNaLista(g, de, antesDe));
    else if (lista.tipo === "dentro") setDentro((d) => ({ ...d, [lista.mae]: moverNaLista(lista.chaves, de, antesDe) }));
    else setBlocos((atual) => moverNoMenu(atual, lista, de, antesDe));
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

  /** O olho de um item do Geral (`mae` ausente) ou de dentro de um menu. */
  function esconderItem(chave: string, label: string, mae?: string) {
    const atual = mae ? ocultasDentro[mae] ?? [] : ocultasGeral;
    const escondida = !atual.includes(chave);
    const novo = alternarOculta(atual, chave);
    if (mae) setOcultasDentro((o) => ({ ...o, [mae]: novo }));
    else setOcultasGeral(novo);
    setMudou(true);
    setPadrao(false);
    setAviso(escondida ? `${label} sai do menu.` : `${label} volta ao menu.`);
  }

  function restaurar() {
    setBlocos(blocosPadrao);
    setOcultas([]);
    setGeral(geralPadrao);
    setDentro({});
    setOcultasGeral([]);
    setOcultasDentro({});
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
        : await salvarOrdemDoMenuPeloCodigo(setor.code, JSON.stringify(ordemDosBlocos(blocos, { ocultas, geral: geral.map((g) => g.chave), dentro, ocultasGeral, ocultasDentro })));
      if (r?.error) {
        toast.error(r.error);
        return;
      }
      setAberto(false);
      toast.success(`Menu de ${setor.label} organizado.`);
    });
  }

  /** O que fica dentro do menu `mae`, na ordem escolhida (ou na que veio). */
  const emOrdem = <T,>(mae: string, itens: readonly T[], chave: (i: T) => string) => pelaOrdem(itens, chave, dentro[mae] ?? []);

  /** O item está escondido: do Geral (`mae` ausente) ou de dentro de um menu. */
  const escondido = (chave: string, mae?: string) => (mae ? ocultasDentro[mae] ?? [] : ocultasGeral).includes(chave);

  return { aberto, abrir, concluir, restaurar, mover, esconder, esconderItem, escondido, emOrdem, blocos, geral, ocultas, salvando, aviso, setor };
}

const chaveDaLista = (l: ListaDoMenu) =>
  l.tipo === "blocos" || l.tipo === "geral" ? l.tipo : l.tipo === "grupo" ? `grupo:${l.grupo}` : `${l.tipo}:${l.mae}`;

/** O que está sendo arrastado: a lista, a posição de onde saiu e a de onde vai cair. */
type Arrasto = { lista: ListaDoMenu; chave: string; de: number; code: string; rotulo: string; y0: number; andou: boolean; antesDe: number | null };

/**
 * Onde o ponteiro cai na lista: antes do primeiro item cuja metade de cima
 * fica abaixo dele; passou de todos, no fim. Os itens são os elementos com
 * `data-lista` igual à chave, na ordem da tela.
 */
function posicaoNoPonto(chave: string, y: number): number {
  const itens = [...document.querySelectorAll<HTMLElement>(`[data-lista="${CSS.escape(chave)}"]`)];
  const i = itens.findIndex((el) => {
    const r = el.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
  return i < 0 ? itens.length : i;
}

/** O aviso do topo do modo de edição. */
export function AvisoDaOrganizacao({ setor }: { setor: string }) {
  return (
    <div className="mb-2 rounded-lg border border-brand-200 bg-brand-subtle px-3 py-2.5 dark:border-brand-800">
      <p className="flex items-center gap-2 text-ui font-semibold text-brand">
        <SlidersVertical size={15} aria-hidden className="flex-shrink-0" />
        Organizando o menu
      </p>
      <p className="mt-1 text-fs-1 leading-snug text-fg-secondary">
        Segure pelos pontinhos e arraste: cada item muda de ordem só dentro do menu dele. O olho esconde o item do menu de {setor} sem tirá-lo do lugar.
      </p>
    </div>
  );
}

/**
 * O arrasto, compartilhado pelo Geral e pelo menu do setor: cada um chama
 * `useArrasto` e espalha `pegador(...)` nas linhas.
 */
function useArrasto(org: OrganizacaoDoMenu) {
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const travado = org.salvando;

  /** Os eventos e a aparência de um item que arrasta dentro de `lista`, na posição `i` de `total`. */
  function pegador(lista: ListaDoMenu, i: number, total: number, code: string, rotulo: string) {
    const chave = chaveDaLista(lista);
    const meu = arrasto?.code === code && arrasto.chave === chave;
    const alvo = arrasto?.andou && arrasto.chave === chave ? arrasto.antesDe : null;
    const marca = alvo === i ? "shadow-[0_-3px_0_0_var(--color-brand)]" : alvo === i + 1 && alvo === total ? "shadow-[0_3px_0_0_var(--color-brand)]" : "";
    return {
      /** Vai no elemento que conta como uma posição da lista (a linha, ou o grupo inteiro). */
      item: { "data-lista": chave, "data-i": i },
      marca,
      arrastando: meu && !!arrasto?.andou,
      /** Vai na linha que segura o arrasto. */
      linha: {
        onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
          if (travado || e.button !== 0) return;
          const alvoDoToque = e.target as Element;
          if (alvoDoToque.closest("[data-nao-arrasta]")) return;
          // No toque, só a alça segura: o resto da linha rola o menu.
          if (e.pointerType !== "mouse" && !alvoDoToque.closest("[data-alca]")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setArrasto({ lista, chave, de: i, code, rotulo, y0: e.clientY, andou: false, antesDe: null });
        },
        onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
          if (!arrasto || arrasto.code !== code) return;
          const andou = arrasto.andou || Math.abs(e.clientY - arrasto.y0) > 4;
          if (!andou) return;
          e.preventDefault();
          // Perto da borda, o menu rola sozinho.
          const nav = e.currentTarget.closest("nav");
          if (nav) {
            const r = nav.getBoundingClientRect();
            if (e.clientY < r.top + 36) nav.scrollTop -= 10;
            else if (e.clientY > r.bottom - 36) nav.scrollTop += 10;
          }
          const antesDe = posicaoNoPonto(arrasto.chave, e.clientY);
          if (!arrasto.andou || antesDe !== arrasto.antesDe) setArrasto({ ...arrasto, andou: true, antesDe });
        },
        onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
          // O destino sai do ponto onde soltou, e não do último movimento
          // guardado: num arrasto rápido o estado ainda não acompanhou.
          if (arrasto && arrasto.code === code && (arrasto.andou || Math.abs(e.clientY - arrasto.y0) > 4)) {
            org.mover(arrasto.lista, arrasto.de, posicaoNoPonto(arrasto.chave, e.clientY), arrasto.rotulo);
          }
          setArrasto(null);
        },
        onPointerCancel: () => setArrasto(null),
      },
      alca: (
        <button
          type="button"
          data-alca={code}
          aria-label={`Mover ${rotulo}`}
          title="Segure e arraste, ou use as setas"
          disabled={travado}
          onKeyDown={(e) => {
            const passo = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
            if (!passo) return;
            e.preventDefault();
            org.mover(lista, i, passo < 0 ? i - 1 : i + 2, rotulo);
            // A alça continua com o foco depois de a linha mudar de lugar.
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-alca="${CSS.escape(code)}"]`)?.focus());
          }}
          className="grid h-9 w-6 flex-shrink-0 cursor-grab touch-none place-items-center rounded-md text-fg-muted transition-colors hover:text-fg active:cursor-grabbing disabled:cursor-default"
        >
          <GripVertical size={15} aria-hidden />
        </button>
      ),
    };
  }

  return { pegador, arrastando: !!arrasto?.andou };
}

const LINHA = "flex h-9 items-center gap-1.5 rounded-lg border pr-0.5 transition-[opacity,box-shadow]";

type Pegador = ReturnType<ReturnType<typeof useArrasto>["pegador"]>;

/** O olho: esconde o item do menu sem tirá-lo do lugar. */
function Olho({ label, oculta, apagadaPelaMae = false, travado, onClick }: { label: string; oculta: boolean; apagadaPelaMae?: boolean; travado: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      data-nao-arrasta
      aria-label={`${oculta ? "Mostrar" : "Esconder"} ${label}`}
      aria-pressed={oculta}
      title={apagadaPelaMae && !oculta ? "Escondida junto com o item de cima" : undefined}
      disabled={travado}
      onClick={onClick}
      className="grid size-8 flex-shrink-0 place-items-center rounded-md text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-40"
    >
      {oculta ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
    </button>
  );
}

/**
 * Uma linha que não é tela do catálogo (Geral, abas de uma tela, telas do
 * Apoio). `comoItem`: a linha é a posição na lista. Com `olho`, dá para
 * esconder; `apagada` quando ela ou o item de cima está escondido.
 */
function LinhaSimples({
  item,
  d,
  comoItem = true,
  olho,
  apagada = false,
}: {
  item: ItemDentro;
  d: Pegador | null;
  comoItem?: boolean;
  olho?: React.ReactNode;
  apagada?: boolean;
}) {
  return (
    <div
      {...(d ? { ...(comoItem ? d.item : {}), ...d.linha } : {})}
      className={`${LINHA} ${apagada ? "border-border-soft bg-surface-2" : "border-border bg-surface"} ${d ? "cursor-grab" : "pl-2"} ${d?.arrastando ? "opacity-40" : ""} ${comoItem ? (d?.marca ?? "") : ""}`}
    >
      {d?.alca}
      <span aria-hidden className={`flex-shrink-0 [&>svg]:size-[15px] ${apagada ? "text-fg-muted" : "text-fg-secondary"}`}>{item.icon}</span>
      <span className={`min-w-0 flex-1 truncate text-fs-2 ${apagada ? "text-fg-muted" : "text-fg"}`}>{item.label}</span>
      {olho}
    </div>
  );
}

/** A lista recuada do que fica dentro de um menu. */
function ListaDeDentro({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <ul aria-label={`Telas dentro de ${titulo}`} className="ml-3 space-y-1 border-l border-border pl-2">
      {children}
    </ul>
  );
}

/** O Geral em modo de edição: só a ordem, dentro dele. */
export function GeralEmOrganizacao({ org }: { org: OrganizacaoDoMenu }) {
  const { pegador, arrastando } = useArrasto(org);
  if (org.geral.length === 0) return null;
  return (
    <ul aria-label="Geral" className={`space-y-1 ${arrastando ? "cursor-grabbing select-none" : ""}`}>
      {org.geral.map((g, i) => {
        const d = org.geral.length > 1 ? pegador({ tipo: "geral" }, i, org.geral.length, `geral:${g.chave}`, g.label) : null;
        // O Apoio com mais de uma tela: as de dentro mudam de ordem só ali.
        const filhos = g.filhos && g.filhos.length > 1 ? org.emOrdem(g.chave, g.filhos, (x) => x.chave) : [];
        const chaves = filhos.map((x) => x.chave);
        const oculto = org.escondido(g.chave);
        return (
          <li key={g.chave} {...(d?.item ?? {})} className={`space-y-1 rounded-lg ${d?.marca ?? ""}`}>
            <LinhaSimples
              item={g}
              d={d}
              comoItem={false}
              apagada={oculto}
              olho={<Olho label={g.label} oculta={oculto} travado={org.salvando} onClick={() => org.esconderItem(g.chave, g.label)} />}
            />
            {filhos.length > 0 && (
              <ListaDeDentro titulo={g.label}>
                {filhos.map((x, j) => {
                  const xOculto = org.escondido(x.chave, g.chave);
                  return (
                    <li key={x.chave}>
                      <LinhaSimples
                        item={x}
                        d={pegador({ tipo: "dentro", mae: g.chave, chaves }, j, filhos.length, `${g.chave}>${x.chave}`, x.label)}
                        apagada={xOculto || oculto}
                        olho={<Olho label={x.label} oculta={xOculto} apagadaPelaMae={oculto} travado={org.salvando} onClick={() => org.esconderItem(x.chave, x.label, g.chave)} />}
                      />
                    </li>
                  );
                })}
              </ListaDeDentro>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * O menu do setor em modo de edição: as mesmas linhas do menu, uma por tela,
 * na ordem em que vão ficar. Cada lista arrasta só dentro dela (os blocos, as
 * telas de um grupo, o que fica dentro de uma tela); a alça também anda com as setas
 * do teclado.
 */
export function MenuEmOrganizacao({
  org,
  itemNoTopo,
  subsDe = () => [],
}: {
  org: OrganizacaoDoMenu;
  itemNoTopo?: { label: string; icon: React.ReactNode };
  /** As abas de uma tela que têm entrada no menu (Robôs, Sites, Apps…), com a chave `sub:<nome>`. */
  subsDe?: (code: string) => ItemDentro[];
}) {
  const { pegador, arrastando } = useArrasto(org);
  const travado = org.salvando;

  const olho = (t: Tela, apagadaPelaMae: boolean) => (
    <Olho label={t.label} oculta={org.ocultas.includes(t.code)} apagadaPelaMae={apagadaPelaMae} travado={travado} onClick={() => org.esconder(t)} />
  );

  /** Uma linha de tela: alça, ícone, nome, olho. `d` são os eventos do arrasto, quando a lista tem mais de um item. */
  const linha = (t: Tela, d: Pegador | null, apagadaPelaMae = false, comoItem = true) => {
    const oculta = org.ocultas.includes(t.code) || apagadaPelaMae;
    return (
      <div
        {...(d ? { ...(comoItem ? d.item : {}), ...d.linha } : {})}
        className={`${LINHA} ${oculta ? "border-border-soft bg-surface-2" : "border-border bg-surface"} ${d ? "cursor-grab" : "pl-2"} ${
          d?.arrastando ? "opacity-40" : ""
        } ${comoItem ? (d?.marca ?? "") : ""}`}
      >
        {d?.alca}
        <span aria-hidden className={`flex-shrink-0 ${oculta ? "text-fg-muted" : "text-fg-secondary"}`}>
          <ModuleIcon code={t.code} size={15} />
        </span>
        <span className={`min-w-0 flex-1 truncate text-fs-2 ${oculta ? "text-fg-muted" : "text-fg"}`}>{t.label}</span>
        {olho(t, apagadaPelaMae)}
      </div>
    );
  };

  /** A tela e, recuadas embaixo, as que vieram dela. `d` arrasta a tela com as filhas. */
  const entrada = (e: EntradaDoMenu<Tela>, d: Pegador | null) => {
    const maeOculta = org.ocultas.includes(e.tela.code);
    // O que fica dentro da tela: as que vieram dela e as abas com entrada no
    // menu, juntas, na ordem escolhida — mudam de lugar só ali dentro.
    const dentro = org.emOrdem(
      e.tela.code,
      [...e.filhas.map((f) => ({ chave: f.code, tela: f as Tela | null, item: null as ItemDentro | null })), ...subsDe(e.tela.code).map((x) => ({ chave: x.chave, tela: null, item: x }))],
      (x) => x.chave,
    );
    const chaves = dentro.map((x) => x.chave);
    const pegar = (j: number, x: (typeof dentro)[number], rotulo: string) =>
      dentro.length > 1 ? pegador({ tipo: "dentro", mae: e.tela.code, chaves }, j, dentro.length, `${e.tela.code}>${x.chave}`, rotulo) : null;
    return (
      <div {...(d?.item ?? {})} className={`space-y-1 rounded-lg ${d?.marca ?? ""}`}>
        {linha(e.tela, d, false, false)}
        {dentro.length > 0 && (
          <ListaDeDentro titulo={e.tela.label}>
            {dentro.map((x, j) => (
              <li key={x.chave}>
                {x.tela ? (
                  linha(x.tela, pegar(j, x, x.tela.label), maeOculta)
                ) : (
                  <LinhaSimples
                    item={x.item!}
                    d={pegar(j, x, x.item!.label)}
                    apagada={org.escondido(x.chave, e.tela.code) || maeOculta}
                    olho={
                      <Olho
                        label={x.item!.label}
                        oculta={org.escondido(x.chave, e.tela.code)}
                        apagadaPelaMae={maeOculta}
                        travado={travado}
                        onClick={() => org.esconderItem(x.chave, x.item!.label, e.tela.code)}
                      />
                    }
                  />
                )}
              </li>
            ))}
          </ListaDeDentro>
        )}
      </div>
    );
  };

  const variosBlocos = org.blocos.length > 1;
  const bloco = (b: BlocoDoMenu<Tela>, i: number) => {
    if (b.tipo === "solta") {
      const d = variosBlocos ? pegador({ tipo: "blocos" }, i, org.blocos.length, b.entrada.tela.code, b.entrada.tela.label) : null;
      return <li key={b.grupo}>{entrada(b.entrada, d)}</li>;
    }
    const d = variosBlocos ? pegador({ tipo: "blocos" }, i, org.blocos.length, `grupo:${b.grupo}`, `o grupo ${b.grupo}`) : null;
    return (
      <li key={b.grupo} {...(d?.item ?? {})} className={`rounded-lg transition-[opacity,box-shadow] ${d?.arrastando ? "opacity-40" : ""} ${d?.marca ?? ""}`}>
        <div {...(d?.linha ?? {})} className={`flex items-center gap-1.5 rounded-md pt-2.5 pb-1 ${d ? "cursor-grab" : ""}`}>
          {d?.alca}
          <span className="c41-rotulo min-w-0 flex-1 truncate">{b.grupo}</span>
        </div>
        <ul aria-label={`Grupo ${b.grupo}`} className="space-y-1">
          {b.entradas.map((e, j) => (
            <li key={e.tela.code}>{entrada(e, b.entradas.length > 1 ? pegador({ tipo: "grupo", grupo: b.grupo }, j, b.entradas.length, e.tela.code, e.tela.label) : null)}</li>
          ))}
        </ul>
      </li>
    );
  };

  return (
    <div className={`space-y-1.5 pt-1 ${arrastando ? "cursor-grabbing select-none" : ""}`}>
      {itemNoTopo && (
        <div className={`${LINHA} border-border bg-surface pl-2`}>
          <span aria-hidden className="flex-shrink-0 text-fg-secondary [&>svg]:size-[15px]">{itemNoTopo.icon}</span>
          <span className="min-w-0 flex-1 truncate text-fs-2 text-fg">{itemNoTopo.label}</span>
          <span title="Sempre no topo" className="grid size-8 flex-shrink-0 place-items-center text-fg-muted">
            <Lock size={13} role="img" aria-label="Sempre no topo" />
          </span>
        </div>
      )}
      <ul aria-label="Telas do setor" className="space-y-1.5">
        {org.blocos.map((b, i) => bloco(b, i))}
      </ul>
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
