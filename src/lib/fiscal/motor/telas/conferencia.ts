// Conferência fiscal no modo motor (API-CONNECT §11.4, 23/10/2026).
//
// Tudo é da raiz e por competência `AAAA-MM` (o ano não é aceito). A
// competência padrão é a primeira de `/conferencia/competencias`, quando a URL
// não pediu outra. Todas as rotas são leves; as listas paginam por cursor de
// deslocamento, opaco para o Connect.

import "server-only";
import { doMotor, type Leitura } from "../leitura";
import { SITUACOES_DO_CONFRONTO, type PaginaDoConfronto, type PaginaDosDocumentosDaConferencia, type PrestadoresNfse, type PreviaFinanceira } from "@/lib/sped/telasDoMotor";
import type { ContextoDoMotor } from "../estabelecimentos";
import { param } from "../url";
import { cursorDaUrl, falha, MODULO, opcaoDaUrl, podeLer, SEM_PERMISSAO, type Params, type TelaDeLeitura } from "./comum";

export async function competenciasDaConferencia(tela: TelaDeLeitura): Promise<Leitura<string[]>> {
  if (!podeLer(tela, MODULO.conferencia)) return falha(SEM_PERMISSAO, "sem_permissao", 403);
  if (!tela.contexto) return falha("Nenhuma raiz de CNPJ liberada.");
  const raiz = tela.contexto.raiz;
  return doMotor(async () => (await tela.motor.cliente.competenciasDaConferencia(raiz)).competencias);
}

/**
 * O recorte da tela com a competência padrão do motor: sem `competencia` na
 * URL, a primeira da lista; com ela, a pedida (validada em `contextoDaUrl`).
 */
export function contextoDaConferencia(contexto: ContextoDoMotor, params: Params, competencias: string[] | null): ContextoDoMotor {
  if (param(params, "competencia") || !competencias?.length) return contexto;
  const primeira = competencias.find((c) => /^\d{4}-(0[1-9]|1[0-2])$/.test(c));
  return primeira ? { ...contexto, competencia: primeira } : contexto;
}

export type PreviaDaTela = { previa: Leitura<PreviaFinanceira>; prestadores: Leitura<PrestadoresNfse> };

export async function carregarPrevia(tela: TelaDeLeitura): Promise<PreviaDaTela | null> {
  const { contexto, motor } = tela;
  if (!contexto || !podeLer(tela, MODULO.conferencia)) return null;
  const [previa, prestadores] = await Promise.all([
    doMotor(() => motor.cliente.previaDaConferencia(contexto.raiz, contexto.competencia)),
    doMotor(() => motor.cliente.prestadores(contexto.raiz, contexto.competencia)),
  ]);
  return { previa, prestadores };
}

export type ConfrontoDaTela = {
  confronto: Leitura<PaginaDoConfronto>;
  documentos: Leitura<PaginaDosDocumentosDaConferencia>;
  situacao: string;
  situacaoDocumentos: string;
  pendentes: boolean;
  cursorConfronto: string | null;
  cursorDocumentos: string | null;
};

/**
 * A aba Confronto: os pagamentos da planilha contra as notas (`situacao`, padrão
 * "sem nota"; `todas` = vazio) e, em bloco separado, a conferência do relatório
 * do Omie (`situacao_doc`, `pendentes=1`). Cada lista tem o seu cursor.
 */
export async function carregarConfronto(tela: TelaDeLeitura, params: Params): Promise<ConfrontoDaTela | null> {
  const { contexto, motor } = tela;
  if (!contexto || !podeLer(tela, MODULO.conferencia)) return null;
  const situacaoUrl = param(params, "situacao");
  const situacao = situacaoUrl === "todas" ? "" : opcaoDaUrl(params, "situacao", SITUACOES_DO_CONFRONTO) ?? "sem_nota";
  const docUrl = param(params, "situacao_doc");
  const situacaoDocumentos = docUrl && /^[a-z_]{1,40}$/.test(docUrl) ? docUrl : "";
  const pendentes = param(params, "pendentes") === "1";
  const cursorConfronto = cursorDaUrl(params, "c_conf");
  const cursorDocumentos = cursorDaUrl(params, "c_doc");
  const [confronto, documentos] = await Promise.all([
    doMotor(() => motor.cliente.confronto(contexto.raiz, { competencia: contexto.competencia, situacao, limite: 50, cursor: cursorConfronto })),
    doMotor(() => motor.cliente.documentosDaConferencia(contexto.raiz, { competencia: contexto.competencia, situacao: situacaoDocumentos || undefined, pendentes, limite: 50, cursor: cursorDocumentos })),
  ]);
  return { confronto, documentos, situacao: situacao || "todas", situacaoDocumentos, pendentes, cursorConfronto, cursorDocumentos };
}
