"use client";

import { useId } from "react";
import { SearchableSelect } from "./SearchableSelect";
import { useNavegarSemRecarregar } from "./NavegacaoSemRecarregar";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";
import { CAMINHO_DO_COOKIE_DA_EMPRESA, enderecoComEmpresa, guardarEmpresaDoPortal } from "@/lib/portal/empresaEscolhida";

type Props = {
  empresas: (EmpresaParaEscolher & { nome: string })[];
  empresaId: string | null;
  /** Rota da tela; a escolha vira `?empresa=<id>` nela. */
  acao: string;
  /** Oferece "Todas as empresas" (Início, Fluxo de caixa, Cobrança, Documentos). */
  permitirTodas?: boolean;
  /** O que a troca leva junto (o mês da DRE, a competência dos documentos). */
  manter?: Record<string, string | null | undefined>;
  /** Na barra de uma tabela: a altura dos filtros dela (h-8). */
  compact?: boolean;
  /** O respiro e a posição de quem usa; o padrão é o `mb-4` de cima das telas. */
  className?: string;
};

/**
 * O seletor de empresa do portal — um só desenho em todas as telas (P13 do
 * polimento de 11/11/2026): o rótulo "Empresa" à vista, o campo com busca do
 * cadastro de empresas, e a troca navega sozinha, sem "Aplicar".
 *
 * Era uma fileira de botões, um por empresa, e o Kauan pediu o seletor com busca
 * do cadastro de empresas (18/09). A fileira não cabia: o grupo da BLD tem 21
 * empresas, o escritório quase quatrocentas — e o DRE só mostrava as doze
 * primeiras, então as outras só se abriam pela URL.
 *
 * Até 11/11/2026 o Início, o Fluxo de caixa e a DRE escolhiam a empresa num
 * formulário com "Aplicar" (`FiltroDePeriodo`), e Documentos num painel
 * "Filtros": três desenhos para a mesma escolha, e no Início e no Fluxo o
 * "Aplicar" sem mês nenhum ao lado. Onde há mês (DRE), o mês segue no
 * formulário dele, e a empresa troca aqui levando o mês junto (`manter`).
 *
 * No portal a escolha fica guardada (`guardarEmpresaDoPortal`, P12): a tela
 * seguinte do menu abre na mesma empresa. A tela só aceita a guardada se for
 * do acesso — ver `empresaDaTela`.
 */
export function SeletorDeEmpresaQueNavega({ empresas, empresaId, acao, permitirTodas = false, manter, compact = false, className = "mb-4" }: Props) {
  const { ir } = useNavegarSemRecarregar();
  const id = useId();
  const doPortal = acao === CAMINHO_DO_COOKIE_DA_EMPRESA || acao.startsWith(`${CAMINHO_DO_COOKIE_DA_EMPRESA}/`);
  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`.trim()}>
      {/* Rótulo à vista (P43): só o "Buscar empresa…" do campo vazio não dizia
          o que se escolhia, e com a empresa escolhida nem isso. */}
      <label htmlFor={id} className="shrink-0 text-ui font-medium text-fg-secondary">
        Empresa
      </label>
      <SearchableSelect
        // Remonta quando a URL muda por fora (o voltar do navegador), como em
        // AcervoFiltros — o estado interno é só o valor inicial.
        key={empresaId ?? ""}
        id={id}
        name="empresa"
        compact={compact}
        // No celular o campo ocupa o resto da linha; no computador, a largura
        // de um nome de empresa comprido.
        className="min-w-0 flex-1 sm:flex-none sm:w-80"
        aria-label="Empresa"
        options={opcoesDeEmpresa(empresas)}
        avatar
        lembrarRecentes="empresas"
        defaultValue={empresaId ?? ""}
        vazioLabel={permitirTodas ? "Todas as empresas" : undefined}
        textoSemValor={permitirTodas ? undefined : "Escolha a empresa…"}
        placeholder="Buscar empresa…"
        onChange={(v) => {
          const escolhida = v || null;
          if (escolhida === empresaId) return;
          if (!escolhida && !permitirTodas) return;
          if (doPortal) guardarEmpresaDoPortal(escolhida);
          ir(enderecoComEmpresa(acao, escolhida, manter));
        }}
      />
    </div>
  );
}
