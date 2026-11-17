// Ex-clientes nas telas da auditoria: lê a última lista que o robô mandou e
// classifica as empresas ativas (regras em ../regras/auditExClientes.ts).
// Usado por Pastas, Aditivos, Contratos e Honorários.

import * as base from './auditRepository';
import { classificarExClientes, SEM_EX_CLIENTES, type ResultadoExClientes } from '../regras/auditExClientes';

/** Sem lista ainda (robô sem a 1.2, ou pasta não configurada): ninguém sai. */
export async function carregarExClientes(
  empresas: { id: string; razao_social: string; cnpj: string }[],
  temPastaAtiva: (companyId: string) => boolean,
): Promise<ResultadoExClientes> {
  const lista = await base.buscarUltimaListaExClientes();
  if (!lista?.length) return SEM_EX_CLIENTES;
  return classificarExClientes(
    lista,
    empresas.map((e) => ({ id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj })),
    temPastaAtiva,
  );
}
