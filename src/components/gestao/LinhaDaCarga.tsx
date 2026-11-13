"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SelosDoItem, ORIGEM } from "@/components/gestao/ItemDaGestao";
import type { ItemDaPessoa, ItensDaPessoa } from "@/app/(app)/gestao/actions";
import type { Origem } from "@/lib/gestao/regras";

export type CargaDaLinha = {
  abertos: number;
  porOrigem: Record<Origem, number>;
  parados: number;
  vencidos: number;
  vencendo: number;
};

/** As colunas da tabela dos Coordenadores, na ordem — a linha aberta ocupa todas. */
export const COLUNAS_DA_CARGA = 10;

const ROTULO: Record<Origem, [string, string]> = {
  PROCESSO: ["processo", "processos"],
  CARD: ["atividade", "atividades"],
  PENDENCIA: ["pendência", "pendências"],
  TRANSFERENCIA: ["transferência", "transferências"],
  SOLICITACAO: ["solicitação", "solicitações"],
};
const ORDEM: Origem[] = ["PROCESSO", "CARD", "PENDENCIA", "TRANSFERENCIA", "SOLICITACAO"];

/** "3 processos · 12 atividades" — no celular, onde as colunas por tipo não cabem. */
function composicao(porOrigem: Record<Origem, number>): string {
  return ORDEM.filter((o) => porOrigem[o] > 0)
    .map((o) => `${porOrigem[o]} ${ROTULO[o][porOrigem[o] === 1 ? 0 : 1]}`)
    .join(" · ");
}

type Lista = { itens: ItemDaPessoa[]; total: number };

/**
 * A linha de uma pessoa nos Coordenadores (13/11/2026, melhoria-662): a carga
 * em números e, ao abrir, a lista dela numa linha de largura inteira logo
 * abaixo. A lista vem do servidor só quando abre — antes, a de todo mundo ia
 * na página, duas vezes (cartão no celular e tabela no computador).
 *
 * Começa fechada. O cabeçalho é um botão com `aria-expanded`; a linha de baixo
 * fica no DOM escondida, para o `aria-controls` ter destino.
 */
export function LinhaDaCarga({
  pessoa,
  carga,
  setor,
  carregar,
}: {
  pessoa: { id: string; nome: string; coordenacao: boolean; setores: string };
  carga: CargaDaLinha;
  /** O setor do filtro da tela, que a lista respeita. */
  setor: string | null;
  carregar: (userId: string, setor: string | null, desde: number) => Promise<ItensDaPessoa>;
}) {
  const idDaLista = useId();
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState<Lista | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function ler(desde: number) {
    setCarregando(true);
    setErro(null);
    try {
      const r = await carregar(pessoa.id, setor, desde);
      if ("error" in r) setErro(r.error);
      else setLista((antes) => ({ itens: desde > 0 && antes ? [...antes.itens, ...r.itens] : r.itens, total: r.total }));
    } catch {
      setErro("Não deu para carregar os itens. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  function alternar() {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo && !lista && !carregando) void ler(0);
  }

  const TD = "px-3 tabular-nums";
  const POR_TIPO = `${TD} hidden md:table-cell`;
  const temItens = carga.abertos > 0;
  const nome = (
    <span className="min-w-0">
      <span className="font-medium text-fg">{pessoa.nome}</span>
      {pessoa.coordenacao && (
        <Badge variant="info" className="ml-1">
          Coordenação
        </Badge>
      )}
      {pessoa.setores && <span className="block text-fs-1 font-normal text-fg-muted">{pessoa.setores}</span>}
    </span>
  );

  return (
    <>
      <tr className="border-b border-border align-top">
        <td className="px-3">
          {temItens ? (
            <button
              type="button"
              aria-expanded={aberto}
              aria-controls={idDaLista}
              onClick={alternar}
              className="mx-auto flex items-start gap-1 rounded-sm text-center cursor-pointer"
            >
              <ChevronRight
                aria-hidden
                className={`mt-[0.2em] size-[1.1em] flex-shrink-0 text-fg-muted transition-transform motion-reduce:transition-none ${aberto ? "rotate-90" : ""}`}
              />
              {nome}
              <span className="sr-only">{aberto ? " — esconder os itens" : " — ver os itens"}</span>
            </button>
          ) : (
            nome
          )}
        </td>
        <td className={`${TD} font-semibold text-fg`}>{carga.abertos}</td>
        <td className={POR_TIPO}>{carga.porOrigem.PROCESSO}</td>
        <td className={POR_TIPO}>{carga.porOrigem.CARD}</td>
        <td className={POR_TIPO}>{carga.porOrigem.PENDENCIA}</td>
        <td className={POR_TIPO}>{carga.porOrigem.TRANSFERENCIA}</td>
        <td className={POR_TIPO}>{carga.porOrigem.SOLICITACAO}</td>
        <td className={`${TD} ${carga.parados ? "text-warning-fg font-medium" : ""}`}>{carga.parados}</td>
        <td className={`${TD} ${carga.vencidos ? "text-danger font-medium" : ""}`}>{carga.vencidos}</td>
        <td className={TD}>{carga.vencendo}</td>
      </tr>
      {temItens && (
        <tr id={idDaLista} hidden={!aberto} className="border-b border-border bg-surface-2">
          <td colSpan={COLUNAS_DA_CARGA} className="px-3">
            <div className="mx-auto w-fit max-w-full flex flex-col gap-2 text-left">
              <p className="text-fs-1 text-fg-muted md:hidden">{composicao(carga.porOrigem)}</p>
              {lista && lista.itens.length === 0 && !carregando && <p className="text-fs-2 text-fg-muted">Nada em aberto.</p>}
              {lista && lista.itens.length > 0 && (
                <ul className="flex flex-col gap-1.5">
                  {lista.itens.map((x) => (
                    <li key={x.chave} className="flex flex-col">
                      <Link href={x.href} className="text-fs-2 text-fg hover:underline break-words">
                        {x.titulo}
                      </Link>
                      <span className="flex flex-wrap items-center gap-1 text-fs-1 text-fg-muted">
                        {ORIGEM[x.origem]} · {x.rotuloDoSetor} <SelosDoItem c={x.c} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {/* Só o estado é anunciado — a lista inteira no aria-live seria
                  lida item a item a cada leitura. */}
              <p role="status" className="text-fs-2 text-fg-muted empty:hidden">
                {carregando ? "Carregando os itens…" : ""}
              </p>
              {erro && (
                <p role="alert" className="flex flex-wrap items-center gap-2 text-fs-2 text-danger">
                  {erro}
                  <Button variant="secondary" size="xs" onClick={() => void ler(lista?.itens.length ?? 0)}>
                    Tentar de novo
                  </Button>
                </p>
              )}
              {lista && !erro && lista.itens.length < lista.total && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-fs-1 text-fg-muted tabular-nums">
                    {lista.itens.length} de {lista.total}
                  </span>
                  {/* Fica montado enquanto lê: sumir levaria o foco de quem
                      usa o teclado para o começo da página. */}
                  <Button
                    variant="secondary"
                    size="xs"
                    aria-disabled={carregando}
                    onClick={() => {
                      if (!carregando) void ler(lista.itens.length);
                    }}
                  >
                    Mostrar mais
                  </Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
