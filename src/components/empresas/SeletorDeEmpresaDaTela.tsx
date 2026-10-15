"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { TODAS_AS_EMPRESAS, hrefDaEmpresa, type ModoDeTodas } from "@/lib/empresas/escolhaDaEmpresa";
import { registrarEmpresaAberta } from "@/app/(app)/empresa-aberta-actions";
import { ConferirFoco } from "./FaixaDoFoco";

export type PropsDoSeletorDeEmpresa = {
  empresas: (EmpresaParaEscolher & { nome: string })[];
  /** O id escolhido, `TODAS_AS_EMPRESAS`, ou `null` — nenhuma ainda (a tela pede para escolher). */
  valor: string | null;
  /** Rota da tela; a escolha vira `?empresa=<id>` nela. */
  acao: string;
  /** Parâmetros que a troca de empresa conserva (aba, mês, visão). */
  manter?: Record<string, string | undefined>;
  /** Oferece "Todas as empresas" — e como ela vai para a URL (ver `ModoDeTodas`). */
  todas?: ModoDeTodas;
  /**
   * Nas telas que seguem o foco (15/10/2026): a empresa em foco que a tela
   * leu (`null` sem foco), para conferir com a faixa do topo (`ConferirFoco`).
   * Fora delas, não vem.
   */
  focoDaTela?: string | null;
};

/**
 * O seletor de empresa das telas da equipe (13/10/2026): busca por nome ou
 * CNPJ, logo, filial recuada embaixo da matriz e as recentes no topo — o
 * `SearchableSelect` de empresa de sempre —, com o rótulo "Empresa" na frente,
 * como os campos do painel de filtros.
 *
 * Escolher uma empresa **grava a escolha como a última aberta** pela pessoa
 * (`registrarEmpresaAberta`) e só então navega: a próxima tela de uma empresa
 * por vez abre nela, em qualquer computador. Se gravar falhar, navega igual —
 * a URL já diz a empresa.
 *
 * Nasceu da junção do `SeletorDeEmpresaQueNavega` (que o portal continua
 * usando) com o `SeletorDeEmpresaDoFiltro`: os dois navegavam sozinhos, e
 * nenhum lembrava a escolha.
 */
export function SeletorDeEmpresaDaTela({ empresas, valor, acao, manter, todas, focoDaTela }: PropsDoSeletorDeEmpresa) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const escolhida = valor && valor !== TODAS_AS_EMPRESAS ? valor : "";
  // "Todas" é a escolha atual: explícita na URL, ou o padrão da tela leve sem empresa.
  const emTodas = valor === TODAS_AS_EMPRESAS || (todas === "padrao" && valor === null);

  function escolher(v: string) {
    if (v ? v === escolhida : emTodas) return;
    iniciar(async () => {
      if (v) await registrarEmpresaAberta(v).catch(() => undefined);
      router.push(hrefDaEmpresa(acao, v, { manter, todas }));
    });
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 max-w-full transition-opacity ${pendente ? "opacity-60" : ""}`} aria-busy={pendente || undefined}>
      <span className="c41-rotulo flex-shrink-0">Empresa</span>
      <SearchableSelect
        // Remonta quando a URL muda por fora (o voltar do navegador) — o estado
        // interno é só o valor inicial.
        key={valor ?? ""}
        name="empresa"
        compact
        className="w-80 max-w-full min-w-0"
        aria-label="Empresa"
        options={opcoesDeEmpresa(empresas)}
        avatar
        lembrarRecentes="empresas"
        defaultValue={escolhida}
        vazioLabel={todas ? "Todas as empresas" : undefined}
        textoSemValor={valor === null && todas !== "padrao" ? "Escolha a empresa…" : undefined}
        placeholder="Buscar empresa por nome ou CNPJ…"
        onChange={escolher}
      />
      {focoDaTela !== undefined && <ConferirFoco companyId={focoDaTela} />}
    </div>
  );
}
