"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { Checkbox } from "@/components/ui/Checkbox";
import { normalizar } from "@/lib/buscaDeTelas";

export type OpcaoDeSetor = {
  value: string;
  label: string;
  /** A cor do setor (a do cadastro, a mesma do `SectorChip`). Sem ela, cinza. */
  cor?: string;
  disabled?: boolean;
};

/** A partir de quantos setores a busca aparece por padrão. */
export const SETORES_PARA_BUSCA = 7;

/** Os setores cujo nome tem o que foi digitado, sem acento e sem caixa. */
export function setoresDaBusca<T extends { label: string }>(opcoes: T[], busca: string): T[] {
  const termo = normalizar(busca);
  return termo ? opcoes.filter((o) => normalizar(o.label).includes(termo)) : opcoes;
}

/**
 * Marca ou desmarca de uma vez os setores à vista (os da busca, quando há
 * busca), sem mexer nos desabilitados. A marcação sai na ordem das opções; um
 * código marcado que não está entre elas (setor desativado) fica no fim.
 */
export function marcarEmLote(marcados: string[], opcoes: OpcaoDeSetor[], visiveis: OpcaoDeSetor[], marcar: boolean): string[] {
  const alvo = visiveis.filter((o) => !o.disabled).map((o) => o.value);
  const ficam = new Set(marcados);
  for (const v of alvo) {
    if (marcar) ficam.add(v);
    else ficam.delete(v);
  }
  const conhecidos = new Set(opcoes.map((o) => o.value));
  return [...opcoes.filter((o) => ficam.has(o.value)).map((o) => o.value), ...marcados.filter((v) => !conhecidos.has(v) && ficam.has(v))];
}

/** Liga ou desliga um setor, mantendo a ordem das opções. */
export function alternarSetor(marcados: string[], opcoes: OpcaoDeSetor[], valor: string, ligado: boolean): string[] {
  const ficam = new Set(marcados);
  if (ligado) ficam.add(valor);
  else ficam.delete(valor);
  const conhecidos = new Set(opcoes.map((o) => o.value));
  return [...opcoes.filter((o) => ficam.has(o.value)).map((o) => o.value), ...marcados.filter((v) => !conhecidos.has(v) && ficam.has(v))];
}

type Comum = {
  opcoes: OpcaoDeSetor[];
  /** Título do campo. A contagem "(3 de 11)" vem junto na escolha de vários. */
  rotulo: React.ReactNode;
  /** `campo` (padrão): o rótulo do `CampoForm`. `painel`: caixa alta, como no painel de Filtros. */
  estiloDoRotulo?: "campo" | "painel";
  /**
   * Nome do campo no formulário. Cada setor marcado vai como um valor (o mesmo
   * `FormData.getAll` das caixas de antes). Sem ele, a escolha fica só na tela.
   */
  name?: string;
  /** Mostra o asterisco; na escolha única, o navegador também barra o envio sem setor. */
  required?: boolean;
  disabled?: boolean;
  /** Frase de erro embaixo da caixa (a borda fica vermelha). */
  erro?: React.ReactNode;
  /** Mostra a busca. Padrão: a partir de 7 setores — com menos, a lista inteira cabe à vista. */
  busca?: boolean;
  /** Altura máxima da lista, que rola dentro da caixa. */
  classeDaLista?: string;
  /** Texto quando não há setor nenhum para escolher. */
  vazio?: React.ReactNode;
  className?: string;
};

type Varios = Comum & {
  unico?: false;
  /** Controlado. */
  valor?: string[];
  /** Não controlado: os marcados ao abrir. */
  valorInicial?: string[];
  onChange?: (valores: string[]) => void;
  /** Os botões "Todos" e "Nenhum" ao lado do rótulo. Padrão: sim. */
  todosENenhum?: boolean;
};

type Unico = Comum & {
  unico: true;
  /** Controlado. `""` = nenhum escolhido. */
  valor?: string;
  valorInicial?: string;
  onChange?: (valor: string) => void;
};

/**
 * O seletor de setores do Connect (25/11/2026, melhoria-812, alternativa B —
 * "Lista com busca e caixas"): uma caixa com a busca no topo e a lista dos
 * setores embaixo, cada um com a caixa de marcar, a bolinha da cor e o nome.
 * A lista tem altura máxima e rola dentro da caixa. Na escolha de vários, o
 * rótulo leva a contagem e, à direita, "Todos" e "Nenhum"; na escolha única
 * (`unico`), a caixa vira rádio e os botões saem.
 *
 * Era um desenho por tela: grade de caixas sem cor (Usuários, Chamados),
 * pílulas (Nova transferência), popover com caixas (Compartilhar do módulo) e
 * Select (setor que vai atender).
 *
 * Os setores fora da busca ficam escondidos (`hidden`), não desmontados: os
 * campos continuam no formulário e o `FormData` recebe todos os marcados.
 *
 * Teclado: da busca, ↓ ou Enter vai para a lista (Enter não envia o
 * formulário); na lista de vários, ↑/↓, Home e End andam entre os setores
 * (um ponto de parada só no Tab) e ↑ no primeiro volta para a busca; na
 * escolha única, as setas são as do rádio do navegador.
 */
export function SeletorDeSetores(props: Varios | Unico) {
  const {
    opcoes,
    rotulo,
    estiloDoRotulo = "campo",
    name,
    required = false,
    disabled = false,
    erro,
    classeDaLista = "max-h-60",
    vazio = "Nenhum setor disponível.",
    className = "",
  } = props;
  const unico = props.unico === true;
  const comBusca = props.busca ?? opcoes.length >= SETORES_PARA_BUSCA;
  const comLote = !props.unico && (props.todosENenhum ?? true);

  const base = useId();
  const idDoRotulo = `${base}-rotulo`;
  const idDaLista = `${base}-lista`;
  const idDoErro = `${base}-erro`;
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<string | null>(null);
  const [interno, setInterno] = useState<string[]>(() =>
    props.unico ? (props.valorInicial ? [props.valorInicial] : []) : (props.valorInicial ?? [])
  );
  const marcados = props.unico
    ? props.valor !== undefined
      ? props.valor
        ? [props.valor]
        : []
      : interno
    : (props.valor ?? interno);
  const marcadosSet = new Set(marcados);

  function definir(novos: string[]) {
    if (props.valor === undefined) setInterno(novos);
    if (props.unico) props.onChange?.(novos[0] ?? "");
    else props.onChange?.(novos);
  }

  const visiveis = comBusca ? setoresDaBusca(opcoes, busca) : opcoes;
  const visiveisSet = new Set(visiveis.map((o) => o.value));
  const habilitados = visiveis.filter((o) => !o.disabled);
  // Um ponto de parada no Tab: o setor em que a pessoa estava, ou o primeiro à vista.
  const paradaDoTab = habilitados.find((o) => o.value === foco)?.value ?? habilitados[0]?.value;
  const quantos = opcoes.filter((o) => marcadosSet.has(o.value)).length;

  // Nome interno da escolha única sem `name`: agrupa os rádios.
  const nomeDoRadio = name ?? `${base}-setor`;

  function camposDaLista(): HTMLInputElement[] {
    return Array.from(lista.current?.querySelectorAll<HTMLInputElement>("input") ?? []).filter(
      (i) => !i.disabled && !i.closest("[hidden]")
    );
  }

  function irParaALista() {
    const campos = camposDaLista();
    (campos.find((i) => i.checked && unico) ?? campos.find((i) => i.tabIndex === 0) ?? campos[0])?.focus();
  }

  function aoTeclarNaBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      e.preventDefault();
      irParaALista();
    }
  }

  function aoTeclarNaLista(e: React.KeyboardEvent<HTMLDivElement>) {
    // Na escolha única, as setas são as do rádio do navegador.
    if (unico) return;
    const campos = camposDaLista();
    const i = campos.indexOf(e.target as HTMLInputElement);
    if (i < 0) return;
    let alvo: HTMLElement | undefined;
    if (e.key === "ArrowDown") alvo = campos[i + 1];
    else if (e.key === "ArrowUp") alvo = i === 0 ? (caixa.current?.querySelector<HTMLInputElement>('input[type="search"]') ?? undefined) : campos[i - 1];
    else if (e.key === "Home") alvo = campos[0];
    else if (e.key === "End") alvo = campos[campos.length - 1];
    else return;
    e.preventDefault();
    alvo?.focus();
  }

  const rotuloVisivel = (
    <span id={idDoRotulo} className={estiloDoRotulo === "painel" ? "c41-rotulo" : "text-label font-medium leading-5 text-fg"}>
      {rotulo}
      {required && <span className="text-danger"> *</span>}
      {!unico && (
        <span className={`ml-1.5 font-normal ${estiloDoRotulo === "painel" ? "normal-case tracking-normal" : "text-fg-muted"}`}>
          ({quantos} de {opcoes.length})
        </span>
      )}
    </span>
  );

  return (
    <div ref={caixa} className={`flex min-w-0 flex-col gap-1.5 ${className}`.trim()}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {rotuloVisivel}
        {comLote && opcoes.length > 1 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled}
              aria-label={busca && comBusca ? "Marcar todos os setores da busca" : "Marcar todos os setores"}
              onClick={() => definir(marcarEmLote(marcados, opcoes, visiveis, true))}
            >
              Todos
            </Button>
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled}
              aria-label={busca && comBusca ? "Desmarcar os setores da busca" : "Desmarcar todos os setores"}
              onClick={() => definir(marcarEmLote(marcados, opcoes, visiveis, false))}
            >
              Nenhum
            </Button>
          </div>
        )}
      </div>

      <div className={`overflow-hidden rounded-md border bg-surface ${erro ? "border-danger" : "border-border-strong"}`}>
        {comBusca && opcoes.length > 0 && (
          <div className="border-b border-border p-1.5">
            <CampoDeBusca
              compact
              enviarAoLimpar={false}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={aoTeclarNaBusca}
              placeholder="Buscar setor…"
              aria-label="Buscar setor"
              aria-controls={idDaLista}
              autoComplete="off"
              disabled={disabled}
            />
          </div>
        )}
        <div
          ref={lista}
          id={idDaLista}
          role={unico ? "radiogroup" : "group"}
          aria-labelledby={idDoRotulo}
          aria-describedby={erro ? idDoErro : undefined}
          aria-required={unico && required ? true : undefined}
          aria-invalid={erro ? true : undefined}
          onKeyDown={aoTeclarNaLista}
          className={`${classeDaLista} overflow-y-auto overscroll-contain p-1`}
        >
          {opcoes.map((o) => {
            const marcado = marcadosSet.has(o.value);
            const bloqueado = disabled || o.disabled;
            const campo = unico ? (
              <input
                type="radio"
                name={nomeDoRadio}
                // Sem `name`, fora do formulário (`form=""`) — a não ser com
                // `required`: o rádio sem dono não entra no `reportValidity`.
                form={name || required ? undefined : ""}
                value={o.value}
                checked={marcado}
                required={required}
                disabled={bloqueado}
                onChange={() => definir([o.value])}
                // Barrado pelo `required` com a busca escondendo os setores: a
                // busca sai, para o aviso do navegador ter onde aparecer.
                onInvalid={() => setBusca("")}
                className="size-4 flex-shrink-0 cursor-pointer appearance-none rounded-full border-[1.5px] border-border-strong bg-input-bg transition-[border-color,border-width] hover:border-brand checked:border-[5px] checked:border-brand-solid disabled:cursor-not-allowed"
              />
            ) : (
              <Checkbox
                name={name}
                value={o.value}
                checked={marcado}
                disabled={bloqueado}
                tabIndex={o.value === paradaDoTab ? 0 : -1}
                onFocus={() => setFoco(o.value)}
                onChange={(e) => definir(alternarSetor(marcados, opcoes, o.value, e.target.checked))}
              />
            );
            // O `hidden` sozinho perderia para o `flex` da classe: a classe troca junto.
            const aVista = visiveisSet.has(o.value);
            return (
              <label
                key={o.value}
                hidden={!aVista}
                className={`${aVista ? "flex" : "hidden"} min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-ui text-fg-secondary transition-colors hover:bg-surface-hover has-[:checked]:text-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:hover:bg-transparent`}
              >
                {campo}
                <span aria-hidden className="size-2 flex-shrink-0 rounded-full" style={{ background: o.cor ?? "var(--c41-fg-muted)" }} />
                <span className="min-w-0 break-words">{o.label}</span>
              </label>
            );
          })}
          {opcoes.length === 0 && <p className="px-2 py-2 text-helper text-fg-muted">{vazio}</p>}
          {opcoes.length > 0 && visiveis.length === 0 && (
            <p role="status" className="px-2 py-2 text-helper text-fg-muted">
              Nenhum setor com “{busca.trim()}”.
            </p>
          )}
        </div>
      </div>

      {erro && (
        <p id={idDoErro} className="text-helper font-medium text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
