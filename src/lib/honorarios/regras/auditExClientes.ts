// Ex-clientes — regras puras (sem banco).
//
// Quando o cliente sai, a pasta dele vai para a pasta de ex-clientes na raiz da
// rede ("009_EMPRESAS EX CLIENTES"), mas a empresa continua ativa no Connect,
// porque vem ativa na relação do Domínio. Duas regras, as mesmas do Aditiva
// Pronto (ADR-012, 12/11/2026), trazidas para o Connect a pedido do Societário:
//
// 1. A pasta de ex-clientes nunca é uma pasta de cliente: se aparecer numa
//    varredura, em qualquer nível, fica fora das listas (Pastas, Contratos,
//    Aditivos, Honorários e leitura de textos).
// 2. O robô (1.2+) manda só os NOMES das pastas que estão dentro dela; aqui eles
//    são casados com as empresas pela mesma regra do vínculo automático (nome
//    normalizado único, ou filial pela ordem do CNPJ). Nada de similaridade,
//    para não tirar cliente por engano. Empresa com pasta só em Ex Clientes sai
//    da auditoria; com pasta ativa também, continua, com aviso (a pasta ativa vence).

import { semAcentoMaiusculo } from './auditNormalizacao';
import { agruparPorNome, indexarEmpresas, vinculoAutomatico, type EmpresaVinculavel } from './auditVinculo';

/**
 * A pasta é a de ex-clientes? Sem diferença de maiúscula, acento, traço ou
 * sublinhado, e com prefixo de ordem: "Ex Clientes", "EX CLIENTES",
 * "Ex-Clientes", "009_EMPRESAS EX CLIENTES", "Ex-cliente". "EX" tem que ser
 * palavra inteira ("REX CLIENTES" não é).
 */
export function ehPastaDeExClientes(nome: string): boolean {
  const n = semAcentoMaiusculo(nome).replace(/[^A-Z0-9]+/g, ' ').trim();
  return /(^| )EX ?CLIENTES?( |$)/.test(n);
}

/** Algum segmento de pasta do caminho (sem o arquivo) é a pasta de ex-clientes? */
export function caminhoEmExClientes(caminhoRelativo: string): boolean {
  return caminhoRelativo.split(/[\\/]/).slice(0, -1).some(ehPastaDeExClientes);
}

export interface ExClienteResumo {
  id:          string;
  razaoSocial: string;
  cnpj:        string;
  /** Nome da pasta dentro da pasta de ex-clientes. */
  pasta:       string;
}

export interface ResultadoExClientes {
  /** Pasta só em Ex Clientes: a empresa sai da auditoria. companyId → pasta. */
  fora:  Map<string, string>;
  /** Pasta em Ex Clientes E pasta ativa vinculada: continua, com aviso. companyId → pasta. */
  aviso: Map<string, string>;
}

export const SEM_EX_CLIENTES: ResultadoExClientes = { fora: new Map(), aviso: new Map() };

export function classificarExClientes(
  pastasExClientes: string[],
  empresas: EmpresaVinculavel[],
  temPastaAtiva: (companyId: string) => boolean,
): ResultadoExClientes {
  if (!pastasExClientes.length) return { fora: new Map(), aviso: new Map() };
  const porNome = agruparPorNome(indexarEmpresas(empresas));
  const fora = new Map<string, string>();
  const aviso = new Map<string, string>();
  for (const pasta of pastasExClientes) {
    const id = vinculoAutomatico(pasta, porNome);
    if (!id || fora.has(id) || aviso.has(id)) continue;
    (temPastaAtiva(id) ? aviso : fora).set(id, pasta);
  }
  return { fora, aviso };
}

/** As empresas que saíram da auditoria, em ordem de nome, para o resumo das telas. */
export function resumirForaDaAuditoria(
  r: ResultadoExClientes,
  empresas: { id: string; razao_social: string; cnpj: string }[],
): ExClienteResumo[] {
  return empresas
    .filter((e) => r.fora.has(e.id))
    .map((e) => ({ id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj, pasta: r.fora.get(e.id)! }))
    .sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, 'pt-BR'));
}
