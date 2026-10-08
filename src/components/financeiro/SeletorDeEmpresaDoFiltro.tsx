"use client";

import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { opcoesDeEmpresa, type EmpresaParaEscolher } from "@/lib/empresas/opcoesDoSeletor";

type Props = {
  acao: string;
  empresas: (EmpresaParaEscolher & { nome: string })[];
  empresaId: string | null;
  permitirTodas?: boolean;
  extras?: Record<string, string | undefined>;
};

/**
 * A empresa como única escolha do topo, sem "Aplicar" (08/10/2026) — a regra do
 * `SeletorDeEmpresaQueNavega`: onde só a empresa se escolhe, a troca navega
 * sozinha; o "Aplicar" vale quando empresa e mês vão juntos.
 *
 * É o mesmo seletor, com o que as telas do BPO precisam e ele ainda não tem:
 * os parâmetros que a tela carrega (a aba aberta) e o "Todas as empresas". Se
 * o compartilhado ganhar os dois, este sai.
 */
export function SeletorDeEmpresaDoFiltro({ acao, empresas, empresaId, permitirTodas, extras }: Props) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <SearchableSelect
        // Remonta quando a URL muda por fora (o voltar do navegador), como no
        // seletor compartilhado — o estado interno é só o valor inicial.
        key={empresaId ?? ""}
        name="empresa"
        compact
        className="w-80 max-w-full"
        aria-label="Empresa"
        options={opcoesDeEmpresa(empresas)}
        avatar
        lembrarRecentes="empresas"
        defaultValue={empresaId ?? ""}
        vazioLabel={permitirTodas ? "Todas as empresas" : undefined}
        placeholder="Buscar empresa…"
        onChange={(v) => {
          if (v === (empresaId ?? "")) return;
          const q = new URLSearchParams();
          for (const [k, valor] of Object.entries(extras ?? {})) if (valor) q.set(k, valor);
          if (v) q.set("empresa", v);
          const s = q.toString();
          router.push(s ? `${acao}?${s}` : acao);
        }}
      />
    </div>
  );
}
