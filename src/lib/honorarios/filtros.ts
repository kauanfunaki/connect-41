// Filtros da tela de Honorários (os de Contratos e Aditivos vieram prontos nos
// serviços do Aditiva). Puro: a página filtra no servidor e pagina.

import type { EmpresaHonorario } from "./servidor/honorariosService";
import type { ComparacaoAcessorias, SituacaoHonorario } from "./regras/honorariosRegras";
import { SITUACOES_HONORARIO } from "./regras/honorariosRegras";
import { casaBusca } from "./rotulos";

/** Situações que pedem alguém olhar: o recorte padrão da tela. */
export const SITUACOES_QUE_PEDEM_ACAO: readonly SituacaoHonorario[] = ["CONFERIR", "DIGITALIZADO", "SEM_VALOR", "SEM_DOCUMENTO"];

export type FiltrosHonorarios = {
  /** Uma situação, "acao" (as que pedem ação) ou vazio (todas). */
  situacao?: string;
  /** "1": só as empresas cujo arquivo mais recente é foto ou escaneado. */
  foto?: string;
  acessorias?: string;
  /** Nome do responsável, "__none__" (sem responsável) ou vazio. */
  responsavel?: string;
  busca?: string;
};

const COMPARACOES: readonly ComparacaoAcessorias[] = ["DIFERENTE", "IGUAL", "NAO_ENCONTRADA", "NAO_CONFERIDO"];

export const ehSituacao = (s: string | undefined): s is SituacaoHonorario =>
  !!s && (SITUACOES_HONORARIO as string[]).includes(s);

/** O arquivo mais recente é foto ou escaneado e o valor veio de um documento mais velho. */
export const fotoPendente = (e: EmpresaHonorario) => e.fonte === "documento" && !!e.fotoMaisRecente;

export function filtrarHonorarios(empresas: EmpresaHonorario[], f: FiltrosHonorarios): EmpresaHonorario[] {
  return empresas.filter((e) => {
    if (f.situacao === "acao" && !SITUACOES_QUE_PEDEM_ACAO.includes(e.situacao)) return false;
    if (ehSituacao(f.situacao) && e.situacao !== f.situacao) return false;
    if (f.foto === "1" && !fotoPendente(e)) return false;
    if (f.acessorias && (COMPARACOES as string[]).includes(f.acessorias) && e.acessorias.comparacao !== f.acessorias) return false;
    if (f.responsavel === "__none__" && e.empresa.responsavel) return false;
    if (f.responsavel && f.responsavel !== "__none__" && e.empresa.responsavel !== f.responsavel) return false;
    return casaBusca(f.busca, [e.empresa.razaoSocial], e.empresa.cnpj);
  });
}

/** Os responsáveis que aparecem na lista, em ordem alfabética, para o filtro. */
export function responsaveisDaLista(empresas: { empresa: { responsavel: string | null } }[]): string[] {
  return [...new Set(empresas.map((e) => e.empresa.responsavel).filter((r): r is string => !!r))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}
