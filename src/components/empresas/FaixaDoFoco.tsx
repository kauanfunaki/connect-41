"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Crosshair, LogOut, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { formatCnpj } from "@/lib/format";
import { telaDoFoco } from "@/lib/empresas/foco";
import type { EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { empresasParaOFoco, pararDeTrabalharNaEmpresa, trabalharNaEmpresa } from "@/app/(app)/foco-actions";

/** O que a faixa mostra da empresa em foco — montado no layout. */
export type FocoDaFaixa = {
  companyId: string;
  nome: string;
  logoUrl: string | null;
  /** A matriz da base (a própria empresa, quando não é filial). */
  matrizId: string;
  /** "com 21 filiais", "com a matriz e 20 filiais", ou `null` (empresa sozinha). */
  alcance: string | null;
};

// O foco que o layout leu, para a tela conferir (`ConferirFoco`) e abrir a
// escolha da faixa (`BotaoEscolherEmpresa`). `undefined` fora do casco do app.
//
// Envolve o casco inteiro, não só a tela (05/11/2026): a faixa é desenhada
// pelo casco, e o vazio "Escolha a empresa" de uma tela abre a busca dela.
type FocoDoLayout = {
  companyId: string | null;
  /** A pessoa pode trabalhar numa empresa por vez (a faixa aparece). */
  disponivel: boolean;
  /** A busca de empresa da faixa está aberta. */
  escolhendo: boolean;
  abrirEscolha: () => void;
  fecharEscolha: () => void;
};
const FocoDoLayout = createContext<FocoDoLayout | undefined>(undefined);

export function ProvedorDoFoco({ companyId, disponivel, children }: { companyId: string | null; disponivel: boolean; children: React.ReactNode }) {
  const [escolhendo, setEscolhendo] = useState(false);
  // Trocada a empresa (aqui ou em outra aba), a busca fecha sozinha.
  const [deQual, setDeQual] = useState(companyId);
  if (deQual !== companyId) {
    setDeQual(companyId);
    setEscolhendo(false);
  }
  const valor = useMemo(
    () => ({ companyId, disponivel, escolhendo, abrirEscolha: () => setEscolhendo(true), fecharEscolha: () => setEscolhendo(false) }),
    [companyId, disponivel, escolhendo]
  );
  return <FocoDoLayout.Provider value={valor}>{children}</FocoDoLayout.Provider>;
}

/**
 * Confere a faixa com a tela (15/10/2026). O layout não é desenhado de novo a
 * cada navegação, e o foco trocado em outra aba deixaria a faixa dizendo uma
 * empresa e a tela mostrando outra — o erro que o foco existe para evitar.
 * Quando as duas discordam, pede ao servidor a tela inteira de novo, uma vez.
 */
export function ConferirFoco({ companyId }: { companyId: string | null }) {
  const doLayout = useContext(FocoDoLayout)?.companyId;
  const router = useRouter();
  const pediu = useRef(false);
  useEffect(() => {
    if (doLayout === undefined || doLayout === companyId || pediu.current) return;
    pediu.current = true;
    router.refresh();
  }, [doLayout, companyId, router]);
  return null;
}

/** O botão do vazio "Escolha a empresa" de uma tela: abre a busca da faixa. */
export function BotaoEscolherEmpresa() {
  const foco = useContext(FocoDoLayout);
  if (!foco?.disponivel) return null;
  return (
    <Button onClick={foco.abrirEscolha}>
      <Crosshair size={14} aria-hidden />
      Escolher empresa
    </Button>
  );
}

/**
 * O que segue no endereço ao trocar de empresa (05/11/2026): o período e a aba
 * valem para qualquer empresa; o resto (a conta bancária, o centro de custo, a
 * busca, a página, o `?empresa=`) é da anterior e fica para trás.
 */
const PARAMETROS_QUE_SEGUEM = ["mes", "ano", "competencia", "aba", "secao", "visao", "vista", "tipo", "destino", "situacao"];

function enderecoParaOutraEmpresa(tela: string, atuais: URLSearchParams): string {
  const q = new URLSearchParams();
  for (const chave of PARAMETROS_QUE_SEGUEM) {
    const valor = atuais.get(chave);
    if (valor) q.set(chave, valor);
  }
  const s = q.toString();
  return s ? `${tela}?${s}` : tela;
}

// ─── As abas de empresas (05/11/2026, opção 6 do Victor) ────────────────────
//
// Cada aba é uma empresa em que a pessoa trabalha; a ativa é a empresa em foco
// (o cookie, lido no servidor). As abas moram no navegador — são atalho, não
// permissão: clicar numa aba passa pelo `trabalharNaEmpresa`, que confere tudo.
// Uma base (matriz e filiais) ocupa uma aba só: trocar de filial troca a aba.

type Aba = { id: string; nome: string; logoUrl: string | null; matrizId: string; comUnidades: boolean };
type EmpresaDaLista = EmpresaParaEscolher & { nome: string };

const MAXIMO_DE_ABAS = 8;
const chaveDasAbas = (escritorio: string) => `c41:abas-de-empresas:${escritorio}`;

// As abas guardadas são lidas como loja externa (`useSyncExternalStore`): o
// servidor desenha sem elas, e o navegador as traz sem um efeito a mais. Outra
// aba do navegador que mexer nelas avisa pelo evento `storage`.
const ouvintesDasAbas = new Set<() => void>();
function assinarAbas(avisar: () => void) {
  ouvintesDasAbas.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    ouvintesDasAbas.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

function abasDoTexto(texto: string): Aba[] {
  try {
    const bruto = JSON.parse(texto);
    return Array.isArray(bruto) ? bruto.filter((a): a is Aba => typeof a?.id === "string" && typeof a?.nome === "string").slice(0, MAXIMO_DE_ABAS) : [];
  } catch {
    return [];
  }
}

function textoDasAbas(escritorio: string): string {
  try {
    return window.localStorage.getItem(chaveDasAbas(escritorio)) ?? "[]";
  } catch {
    return "[]";
  }
}

function gravarAbas(escritorio: string, abas: Aba[]) {
  try {
    window.localStorage.setItem(chaveDasAbas(escritorio), JSON.stringify(abas.slice(0, MAXIMO_DE_ABAS)));
  } catch {
    // Sem armazenamento (janela anônima, cota): as abas só não ficam para a próxima.
  }
  for (const avisar of ouvintesDasAbas) avisar();
}

/** A aba entra no lugar da que é da mesma base; senão, no fim (sai a mais antiga, se passar do teto). */
function comAba(abas: Aba[], nova: Aba): Aba[] {
  const i = abas.findIndex((a) => a.id === nova.id || a.matrizId === nova.matrizId);
  if (i >= 0) return abas.map((a, j) => (j === i ? nova : a));
  const lista = [...abas, nova];
  return lista.length > MAXIMO_DE_ABAS ? lista.slice(lista.length - MAXIMO_DE_ABAS) : lista;
}

const matrizDe = (e: EmpresaDaLista) => e.matrizId ?? e.id;

/**
 * A faixa da empresa (15/10/2026), logo abaixo do topo, nas telas que mostram
 * uma empresa por vez (`TELAS_DO_FOCO`). Desde 05/11/2026 é o único lugar de
 * escolher a empresa, e as empresas viram abas: clicar troca, o "+" busca outra
 * ali mesmo, e uma base com filiais abre a janelinha das unidades presa à aba
 * (pedido do Victor: nada de janela no meio da tela).
 *
 * Fora da rolagem, como a faixa da assinatura em modo de leitura: fica parada
 * no topo, e a tela de altura cheia só perde a altura dela (44px).
 */
export function FaixaDoFoco({ foco, escritorio }: { foco: FocoDaFaixa | null; escritorio: string }) {
  const caminho = usePathname();
  const parametros = useSearchParams();
  const router = useRouter();
  const tela = telaDoFoco(caminho);
  const toast = useToast();
  const [pendente, iniciar] = useTransition();
  const doLayout = useContext(FocoDoLayout);
  const buscando = Boolean(doLayout?.escolhendo);

  const textoGuardado = useSyncExternalStore(assinarAbas, () => textoDasAbas(escritorio), () => "[]");
  const [empresas, setEmpresas] = useState<EmpresaDaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // A janelinha das unidades: de qual base, e embaixo de qual aba (ou da busca).
  const [unidadesDe, setUnidadesDe] = useState<{ matrizId: string; ancora: string } | null>(null);
  const [esquerda, setEsquerda] = useState(0);
  const faixa = useRef<HTMLDivElement>(null);
  const ancoras = useRef(new Map<string, HTMLElement>());

  // As abas guardadas, com a empresa em foco garantida nelas — a escolhida na
  // ficha da empresa, ou em outra aba do navegador, entra também.
  const abas = useMemo(() => {
    const guardadas = abasDoTexto(textoGuardado);
    return foco ? comAba(guardadas, { id: foco.companyId, nome: foco.nome, logoUrl: foco.logoUrl, matrizId: foco.matrizId, comUnidades: foco.alcance !== null }) : guardadas;
  }, [textoGuardado, foco]);
  const setAbas = (lista: Aba[]) => gravarAbas(escritorio, lista);

  const carregar = useCallback(() => {
    if (empresas !== null) return;
    empresasParaOFoco()
      .then((r) => (r.ok ? setEmpresas(r.empresas) : setErro(r.erro)))
      .catch(() => setErro("Não deu para carregar as empresas. Tente de novo."));
  }, [empresas]);

  useEffect(() => {
    if (buscando) carregar();
  }, [buscando, carregar]);

  const fecharTudo = useCallback(() => {
    doLayout?.fecharEscolha();
    setUnidadesDe(null);
    setBusca("");
    setErro(null);
  }, [doLayout]);

  // Clique fora da faixa ou Esc fecham a busca e a janelinha.
  useEffect(() => {
    if (!buscando && !unidadesDe) return;
    const fora = (e: MouseEvent) => {
      if (faixa.current && !faixa.current.contains(e.target as Node)) fecharTudo();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharTudo();
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [buscando, unidadesDe, fecharTudo]);

  const porId = useMemo(() => new Map((empresas ?? []).map((e) => [e.id, e])), [empresas]);
  const unidadesPorMatriz = useMemo(() => {
    const mapa = new Map<string, EmpresaDaLista[]>();
    for (const e of empresas ?? []) mapa.set(matrizDe(e), [...(mapa.get(matrizDe(e)) ?? []), e]);
    for (const lista of mapa.values()) lista.sort((a, b) => (a.matrizId ? 1 : 0) - (b.matrizId ? 1 : 0) || a.nome.localeCompare(b.nome, "pt-BR"));
    return mapa;
  }, [empresas]);

  const achadas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, "");
    const lista = (empresas ?? []).filter((e) =>
      termo ? e.nome.toLowerCase().includes(termo) || (digitos.length >= 3 && (e.cnpj ?? "").includes(digitos)) : !e.matrizId
    );
    // A matriz antes das filiais: quem busca "bld" quer a base, e a matriz abre as unidades.
    return lista.sort((a, b) => (a.matrizId ? 1 : 0) - (b.matrizId ? 1 : 0) || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, 8);
  }, [busca, empresas]);

  if (!tela) return null;

  function posicionar(ancora: string) {
    const el = ancoras.current.get(ancora);
    const caixa = faixa.current?.getBoundingClientRect();
    if (el && caixa) setEsquerda(Math.max(0, Math.min(el.getBoundingClientRect().left - caixa.left, caixa.width - 360)));
  }

  function trabalhar(empresa: { id: string; nome: string; logoUrl?: string | null; matrizId: string; comUnidades: boolean }) {
    setErro(null);
    iniciar(async () => {
      const r = await trabalharNaEmpresa(empresa.id);
      if (!r.ok) {
        setErro(r.erro);
        // A aba de uma empresa que não abre mais (excluída, de outro escritório) sai.
        const resto = abas.filter((a) => a.id !== empresa.id);
        setAbas(resto);
        return toast.error(r.erro);
      }
      const lista = comAba(abas, { id: empresa.id, nome: empresa.nome, logoUrl: empresa.logoUrl ?? null, matrizId: empresa.matrizId, comUnidades: empresa.comUnidades });
      setAbas(lista);
      fecharTudo();
      router.replace(enderecoParaOutraEmpresa(tela!, new URLSearchParams(parametros.toString())));
      toast.success(`Pronto: as telas por empresa agora mostram e gravam só ${r.descricao}.`);
    });
  }

  function daLista(e: EmpresaDaLista) {
    return { id: e.id, nome: e.nome, logoUrl: e.logoUrl ?? null, matrizId: matrizDe(e), comUnidades: (unidadesPorMatriz.get(matrizDe(e))?.length ?? 1) > 1 };
  }

  // Na busca: a matriz de uma base com filiais abre a janelinha das unidades;
  // uma filial (procurada pelo nome ou CNPJ) ou empresa sozinha entra direto.
  function escolherNaBusca(e: EmpresaDaLista) {
    const unidades = unidadesPorMatriz.get(matrizDe(e)) ?? [e];
    if (!e.matrizId && unidades.length > 1) {
      setUnidadesDe({ matrizId: e.id, ancora: "busca" });
      return;
    }
    trabalhar(daLista(e));
  }

  function clicarAba(aba: Aba) {
    if (aba.id !== foco?.companyId) return trabalhar(aba);
    if (!aba.comUnidades) return;
    if (unidadesDe?.ancora === aba.id) return setUnidadesDe(null);
    carregar();
    posicionar(aba.id);
    doLayout?.fecharEscolha();
    setUnidadesDe({ matrizId: aba.matrizId, ancora: aba.id });
  }

  function fecharAba(aba: Aba) {
    const resto = abas.filter((a) => a.id !== aba.id);
    setAbas(resto);
    if (aba.id !== foco?.companyId) return;
    if (resto[0]) return trabalhar(resto[0]);
    iniciar(async () => {
      await pararDeTrabalharNaEmpresa();
      toast.success("As telas por empresa voltaram a mostrar todas as empresas.");
    });
  }

  function sair() {
    iniciar(async () => {
      await pararDeTrabalharNaEmpresa();
      fecharTudo();
      toast.success("As telas por empresa voltaram a mostrar todas as empresas.");
    });
  }

  function listaDaBusca() {
    return (
        <div className="absolute left-0 top-[calc(100%+6px)] w-[22rem] max-w-[calc(100vw-2rem)] rounded-b-lg border border-t-0 border-border bg-surface py-1.5 shadow-lg">
          {erro ? (
            <p className="px-3 py-2 text-helper text-danger">{erro}</p>
          ) : empresas === null ? (
            <p className="px-3 py-2 text-helper text-fg-muted">Carregando as empresas…</p>
          ) : achadas.length === 0 ? (
            <p className="px-3 py-2 text-helper text-fg-muted">Nenhuma empresa com esse nome ou CNPJ.</p>
          ) : (
            <ul role="listbox" aria-label="Empresas encontradas">
              {achadas.map((e) => {
                const unidadesDaBase = unidadesPorMatriz.get(matrizDe(e))?.length ?? 1;
                const filial = e.matrizId ? porId.get(e.matrizId) : undefined;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={e.id === foco?.companyId}
                      onClick={() => escolherNaBusca(e)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                    >
                      <AvatarImage src={e.logoUrl ?? null} name={e.nome} size={26} shape="lg" fontSize={10} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium text-fg">{e.nome}</span>
                        <span className="block truncate text-helper text-fg-muted">
                          {filial ? `filial de ${filial.nome}` : e.cnpj ? formatCnpj(e.cnpj) : ""}
                          {!e.matrizId && unidadesDaBase > 1 ? ` · matriz e ${unidadesDaBase - 1} ${unidadesDaBase === 2 ? "filial" : "filiais"}` : ""}
                        </span>
                      </span>
                      {!e.matrizId && unidadesDaBase > 1 && <ChevronDown size={14} aria-hidden className="-rotate-90 text-fg-muted" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
    );
  }

  const unidades = unidadesDe ? (unidadesPorMatriz.get(unidadesDe.matrizId) ?? null) : null;
  const matrizDaJanelinha = unidadesDe ? porId.get(unidadesDe.matrizId) : undefined;

  /** A janelinha das unidades: presa à busca (`onde` relativo a ela) ou à aba (`esquerdaPx`, medido no clique). */
  function janelinha(onde: string, esquerdaPx?: number) {
    return (
        <div
          role="dialog"
          aria-label={`Unidades de ${matrizDaJanelinha?.nome ?? "a empresa"}`}
          className={`${onde} w-[22rem] max-w-[calc(100vw-2rem)] rounded-b-lg border border-t-0 border-border bg-surface shadow-lg`}
          style={esquerdaPx === undefined ? undefined : { left: esquerdaPx }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <p className="min-w-0 truncate text-helper text-fg-secondary">
              Em qual unidade de <span className="font-semibold text-fg">{matrizDaJanelinha?.nome ?? "…"}</span>?
            </p>
            <button type="button" onClick={() => setUnidadesDe(null)} aria-label="Fechar as unidades" className="grid size-6 place-items-center rounded text-fg-muted hover:bg-surface-hover">
              <X size={12} aria-hidden />
            </button>
          </div>
          {unidades === null ? (
            <p className="px-3 py-2 text-helper text-fg-muted">Carregando as unidades…</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {unidades.map((u) => {
                const atual = u.id === foco?.companyId;
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => (atual ? setUnidadesDe(null) : trabalhar(daLista(u)))}
                      disabled={pendente}
                      aria-current={atual || undefined}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-hover ${atual ? "bg-brand/5" : ""}`}
                    >
                      <span className={`rounded px-1.5 py-0.5 text-micro font-semibold ${u.matrizId ? "bg-surface-2 text-fg-secondary" : "bg-brand/10 text-brand"}`}>{u.matrizId ? "Filial" : "Matriz"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium text-fg">{u.nome}</span>
                        {u.cnpj && <span className="block text-helper text-fg-muted">{formatCnpj(u.cnpj)}</span>}
                      </span>
                      {atual && <span className="text-helper font-semibold text-brand">Atual</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
    );
  }

  return (
    <div ref={faixa} className="relative z-30 flex-shrink-0">
      <div
        role="region"
        aria-label="Empresas em que você está trabalhando"
        aria-busy={pendente || undefined}
        className={`h-11 flex items-center gap-1.5 border-b border-brand/20 bg-brand/8 px-4 lg:px-6 transition-opacity ${pendente ? "opacity-60" : ""}`}
      >
        <Crosshair size={14} aria-hidden className="flex-shrink-0 text-brand mr-1" />
        <div role="tablist" aria-label="Empresas" className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {abas.length === 0 && !buscando && <span className="whitespace-nowrap px-1 text-ui font-semibold text-fg">Nenhuma empresa escolhida</span>}
          {abas.map((aba) => {
            const ativa = aba.id === foco?.companyId;
            return (
              <div
                key={aba.id}
                ref={(el) => {
                  if (el) ancoras.current.set(aba.id, el);
                  else ancoras.current.delete(aba.id);
                }}
                className={`group flex h-8 flex-shrink-0 items-center rounded-md border pl-1.5 transition-colors ${
                  ativa ? "border-brand/40 bg-surface shadow-sm" : "border-transparent hover:bg-surface/70"
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={ativa}
                  aria-expanded={ativa && aba.comUnidades ? unidadesDe?.ancora === aba.id : undefined}
                  onClick={() => clicarAba(aba)}
                  disabled={pendente}
                  data-dica={ativa ? (aba.comUnidades ? "Trocar a unidade (matriz ou filial)" : aba.nome) : `Trabalhar em ${aba.nome}`}
                  className="flex h-full min-w-0 max-w-64 items-center gap-1.5 rounded-md px-1 text-left focus-visible:outline-2 focus-visible:outline-brand"
                >
                  <AvatarImage src={aba.logoUrl} name={aba.nome} size={20} shape="lg" fontSize={9} />
                  <span className={`truncate text-ui ${ativa ? "font-semibold text-fg" : "text-fg-secondary"}`}>{aba.nome}</span>
                  {ativa && aba.comUnidades && <ChevronDown size={13} aria-hidden className="flex-shrink-0 text-fg-muted" />}
                </button>
                <button
                  type="button"
                  onClick={() => fecharAba(aba)}
                  disabled={pendente}
                  aria-label={`Tirar ${aba.nome} das abas`}
                  className={`mr-0.5 grid size-6 flex-shrink-0 place-items-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg ${ativa ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
            );
          })}
        </div>
        {buscando ? (
          <div
            ref={(el) => {
              if (el) ancoras.current.set("busca", el);
            }}
            className="relative w-64 flex-shrink-0"
          >
            <Input
              compact
              autoFocus
              icon={<Search />}
              aria-label="Buscar empresa por nome ou CNPJ"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setUnidadesDe(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && achadas[0]) {
                  e.preventDefault();
                  escolherNaBusca(achadas[0]);
                }
              }}
              placeholder="Nome ou CNPJ…"
            />
            {unidadesDe?.ancora === "busca" ? janelinha("absolute left-0 top-[calc(100%+6px)]") : listaDaBusca()}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setUnidadesDe(null);
              doLayout?.abrirEscolha();
            }}
            disabled={pendente}
            aria-label="Abrir outra empresa"
            data-dica="Abrir outra empresa"
            className={`flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md text-ui font-semibold text-brand hover:bg-surface/70 ${abas.length === 0 ? "px-2.5 border border-brand/30 bg-surface" : "w-8 justify-center"}`}
          >
            <Plus size={15} aria-hidden />
            {abas.length === 0 && "Escolher empresa"}
          </button>
        )}
        {foco && (
          <Button variant="ghost" size="xs" onClick={sair} disabled={pendente} className="ml-auto flex-shrink-0" data-dica="Parar de trabalhar numa empresa: as telas por empresa voltam a mostrar todas">
            <LogOut size={13} aria-hidden />
            <span className="hidden sm:inline">Todas as empresas</span>
          </Button>
        )}
      </div>

      {unidadesDe && unidadesDe.ancora !== "busca" && janelinha("absolute top-11", esquerda)}
    </div>
  );
}
