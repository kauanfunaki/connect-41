"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Search, X } from "lucide-react";
import { FilterButton } from "@/components/ui/FilterButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export type OpcaoDeFiltro = { value: string; label: string };

export type CampoDeFiltro = {
  /** Nome do parâmetro na URL. */
  chave: string;
  rotulo: string;
  opcoes: OpcaoDeFiltro[];
  /**
   * Rótulo de "sem filtro" — o valor vazio, que tira o parâmetro da URL. Em
   * /pagar é "Em aberto", que é o recorte padrão da tela e não um "todas".
   */
  vazioLabel?: string;
  /**
   * Mostra a etiqueta também no valor padrão (07/10/2026): "Mês: Mais recente
   * (Outubro/2026)", "Período: Últimos 90 dias". Para o filtro que decide o que
   * a tela inteira mostra — sem isto, o período só aparecia dentro do painel, e
   * a DRE não dizia de quando era. No padrão a etiqueta sai neutra e sem o "x":
   * não há o que tirar.
   */
  sempreVisivel?: boolean;
};

/** Acima disto a lista ganha busca — a mesma regra de "muitas competências". */
const COM_BUSCA = 7;

/**
 * O botão "Filtros" das telas do BPO: um painel com os campos à esquerda e, à
 * direita, as opções do campo escolhido, com busca.
 *
 * Nasceu da conferência de 30/09. Os recortes e as competências eram fileiras
 * de pílulas — com três anos de competência são 36 botões para achar um, e
 * ninguém distinguia pílula de filtro de pílula de aba. A regra que ficou: aba
 * troca a tela (`AbasDeLink`); filtro mora aqui, e escolhe-se numa lista com
 * busca, nunca numa fileira de botões.
 *
 * Cada escolha navega na hora (GET), como o filtro de Empresas: a URL continua
 * copiável e o voltar do navegador desfaz. Mudar de filtro volta para a página
 * 1 — ficar na página 5 de um filtro que só tem uma abriria a tela vazia.
 */
export function FiltrosDaTela({
  campos,
  className = "",
  naBarra = false,
}: {
  campos: CampoDeFiltro[];
  className?: string;
  /** Na barra do `CascoDaTabela` (05/10/2026): o botão fica na ponta direita,
   *  o painel abre para a esquerda e as etiquetas vêm antes do botão. */
  naBarra?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [campoAberto, setCampoAberto] = useState(campos[0]?.chave ?? "");
  const [busca, setBusca] = useState("");

  function hrefCom(chave: string, valor: string) {
    const q = new URLSearchParams(params.toString());
    if (valor) q.set(chave, valor);
    else q.delete(chave);
    q.delete("pagina");
    q.delete("page");
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  }

  const ativos = campos.filter((c) => params.get(c.chave));
  const umSo = campos.length === 1;
  const campo = campos.find((c) => c.chave === campoAberto) ?? campos[0];
  const valorAtual = campo ? (params.get(campo.chave) ?? "") : "";

  const opcoesVisiveis = useMemo(() => {
    if (!campo) return [];
    const q = busca.trim().toLowerCase();
    return q ? campo.opcoes.filter((o) => o.label.toLowerCase().includes(q)) : campo.opcoes;
  }, [campo, busca]);

  function rotuloDoValor(c: CampoDeFiltro) {
    const v = params.get(c.chave);
    if (!v) return c.vazioLabel ?? "Todos";
    return c.opcoes.find((o) => o.value === v)?.label ?? v;
  }

  if (campos.length === 0) return null;

  // O que está filtrado fica à vista, com o "x" que tira só aquele. O campo
  // `sempreVisivel` aparece também no padrão, neutro e sem o "x".
  const etiquetas = campos
    .filter((c) => params.get(c.chave) || c.sempreVisivel)
    .map((c) => {
      const filtrado = Boolean(params.get(c.chave));
      return (
        <span
          key={c.chave}
          className={`inline-flex items-center gap-1 h-7 pl-2.5 rounded-full border text-fs-2 text-fg ${
            filtrado ? "pr-1 border-brand/30 bg-brand-subtle" : "pr-2.5 border-border bg-surface-2"
          }`}
        >
          <span className="text-fg-muted">{c.rotulo}:</span>
          <span className="font-medium max-w-[220px] truncate">{rotuloDoValor(c)}</span>
          {filtrado && (
            <button
              type="button"
              onClick={() => router.push(hrefCom(c.chave, ""))}
              aria-label={`Tirar o filtro de ${c.rotulo.toLowerCase()}`}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-fg-muted hover:text-fg hover:bg-surface-hover"
            >
              <X size={12} />
            </button>
          )}
        </span>
      );
    });

  const botao = (
    <FilterButton activeCount={ativos.length} align={naBarra ? "right" : "left"} width={umSo ? 300 : 460}>
      {({ close }) => (
        <div className="flex flex-col gap-2 -m-1">
          <div className={`flex ${umSo ? "" : "min-h-[248px]"}`}>
            {/* Os campos: cada um diz o que está escolhido nele agora. Com um
                campo só (o portal), a coluna não tem o que escolher e some. */}
            <ul className={`w-[150px] flex-shrink-0 border-r border-border pr-2 flex flex-col gap-0.5 ${umSo ? "hidden" : ""}`}>
              {campos.map((c) => {
                const ativo = c.chave === campo?.chave;
                return (
                  <li key={c.chave}>
                    <button
                      type="button"
                      onClick={() => {
                        setCampoAberto(c.chave);
                        setBusca("");
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-md transition-colors ${
                        ativo ? "bg-brand-subtle" : "hover:bg-surface-hover"
                      }`}
                    >
                      <span className={`block text-ui font-medium ${ativo ? "text-brand" : "text-fg"}`}>{c.rotulo}</span>
                      <span
                        className={`block text-micro truncate ${params.get(c.chave) ? "text-fg-secondary" : "text-fg-muted"}`}
                      >
                        {rotuloDoValor(c)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* As opções do campo escolhido. */}
            {campo && (
              <div className={`flex-1 min-w-0 flex flex-col gap-1.5 ${umSo ? "" : "pl-2"}`}>
                {umSo && (
                  <p className="px-1 c41-rotulo">{campo.rotulo}</p>
                )}
                {campo.opcoes.length > COM_BUSCA && (
                  <Input
                    compact
                    autoFocus
                    icon={<Search />}
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder={`Buscar ${campo.rotulo.toLowerCase()}…`}
                    aria-label={`Buscar ${campo.rotulo.toLowerCase()}`}
                  />
                )}
                <ul className="scroll-y max-h-[210px] overflow-y-auto flex flex-col gap-0.5" role="listbox" aria-label={campo.rotulo}>
                  {[{ value: "", label: campo.vazioLabel ?? "Todos" }, ...opcoesVisiveis].map((o) => {
                    const escolhida = o.value === valorAtual;
                    return (
                      <li key={o.value || "__vazio"}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={escolhida}
                          onClick={() => {
                            close();
                            router.push(hrefCom(campo.chave, o.value));
                          }}
                          className={`w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-md text-ui transition-colors ${
                            escolhida ? "bg-brand-subtle text-brand font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                          }`}
                        >
                          <span className="truncate">{o.label}</span>
                          {escolhida && <Check size={13} className="flex-shrink-0" />}
                        </button>
                      </li>
                    );
                  })}
                  {opcoesVisiveis.length === 0 && (
                    <li className="px-2.5 py-2 text-fs-2 text-fg-muted">Nada encontrado para “{busca}”.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          {ativos.length > 0 && (
            <div className="flex justify-end border-t border-border pt-2">
              {/* O `Button xs ghost` (07/10/2026), e não uma cópia dele em peso médio. */}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  close();
                  const q = new URLSearchParams(params.toString());
                  for (const c of campos) q.delete(c.chave);
                  q.delete("pagina");
                  q.delete("page");
                  const s = q.toString();
                  router.push(s ? `${pathname}?${s}` : pathname);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </FilterButton>
  );

  return (
    <div className={`flex flex-wrap items-center gap-2 ${naBarra ? "justify-end" : ""} ${className}`.trim()}>
      {naBarra ? (
        <>
          {etiquetas}
          {botao}
        </>
      ) : (
        <>
          {botao}
          {etiquetas}
        </>
      )}
    </div>
  );
}
