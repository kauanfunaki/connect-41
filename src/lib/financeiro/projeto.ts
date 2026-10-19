// Projeto (19/10, pedido 3 do BPO): o campo Projeto do título no Omie — uma
// ação do negócio medida por receita × despesa (uma obra, um evento, um
// contrato). Funções puras, sem banco.
//
// Segue o centro de custo em tudo o que não é diferença de propósito: por
// empresa, um por lançamento, sempre opcional, nunca apagado (inativa-se).
// Duas diferenças: não tem código — o Omie também não tem —, e não há projeto
// padrão na contraparte: o mesmo fornecedor atende vários projetos, e herdar
// um deles classificaria errado sem ninguém ter escolhido.

import { chaveDaCategoria } from "@/lib/dre/calculo";

export const TAMANHO_MAXIMO_DO_NOME_DO_PROJETO = 120;

/** O nome de um projeto, validado: espaços normalizados, não vazio, no tamanho da coluna. */
export function validarProjeto(nome: string | null | undefined): { ok: true; nome: string } | { ok: false; erro: string } {
  const n = (nome ?? "").trim().replace(/\s+/g, " ");
  if (!n) return { ok: false, erro: "Informe o nome do projeto." };
  if (n.length > TAMANHO_MAXIMO_DO_NOME_DO_PROJETO) {
    return { ok: false, erro: `Nome com mais de ${TAMANHO_MAXIMO_DO_NOME_DO_PROJETO} caracteres.` };
  }
  return { ok: true, nome: n };
}

/** Já existe outro projeto com este nome na empresa? Compara como a categoria: sem acento, caixa ou espaço. */
export function nomeEmUso(nome: string, outros: { name: string }[]): string | null {
  const chave = chaveDaCategoria(nome);
  return outros.find((o) => chaveDaCategoria(o.name) === chave)?.name ?? null;
}

export type ProjetoConhecido = { id: string; companyId: string; active: boolean };

/**
 * O projeto com que um lançamento fica. Informado tem de ser da empresa do
 * lançamento e estar ativo — exceto o que o lançamento **já tinha** (`atualId`):
 * editar outra coisa na conta não pode obrigar a trocar um projeto que foi
 * inativado depois.
 */
export function projetoDoLancamento(p: {
  companyId: string;
  informadoId: string | null;
  projeto: ProjetoConhecido | null;
  atualId?: string | null;
}): { ok: true; projetoId: string | null } | { ok: false; erro: string } {
  if (!p.informadoId) return { ok: true, projetoId: null };
  if (!p.projeto || p.projeto.id !== p.informadoId || p.projeto.companyId !== p.companyId) {
    return { ok: false, erro: "Projeto não encontrado nesta empresa." };
  }
  if (!p.projeto.active && p.projeto.id !== p.atualId) {
    return { ok: false, erro: "Projeto inativo — escolha outro ou reative no cadastro." };
  }
  return { ok: true, projetoId: p.projeto.id };
}

export type ProjetoParaCasar = { id: string; nome: string };

/**
 * O projeto escrito numa linha de CSV, pelo nome. Vazio é "sem projeto";
 * escrito e não encontrado é erro da linha — a pessoa quis classificar.
 */
export function casarProjeto(texto: string, projetos: ProjetoParaCasar[]): { ok: true; projetoId: string | null } | { ok: false; erro: string } {
  const t = texto.trim();
  if (!t) return { ok: true, projetoId: null };
  const chave = chaveDaCategoria(t);
  const achado = projetos.find((p) => chaveDaCategoria(p.nome) === chave);
  if (!achado) return { ok: false, erro: `Projeto "${t}" não existe (ou está inativo) nesta empresa.` };
  return { ok: true, projetoId: achado.id };
}
