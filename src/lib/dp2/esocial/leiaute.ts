// O leiaute do eSocial que o DP 2 gera (12/11/2026, fase 3a).
//
// ⚠️ Versão S-1.3. Quando a Receita publicar versão nova, muda aqui (e confira
// os eventos contra os XSD da versão). O ambiente fica em produção restrita
// (testes) até a assinatura e o envio existirem: nada daqui vale como entrega
// oficial.
//
// Puro, sem banco.

export const VERSAO_DO_LEIAUTE = "v_S_01_03_00";

/** 1 = produção; 2 = produção restrita (o ambiente de testes do governo). */
export const AMBIENTE = "2";

/** procEmi 1 = aplicativo do empregador; verProc = o programa que gerou. */
export const PROCESSO_DE_EMISSAO = "1";
export const VERSAO_DO_PROCESSO = "Connect-DP2-1.0";

/** O identificador da tabela de rubricas do escritório no eSocial (até 8 caracteres). */
export const TABELA_DE_RUBRICAS = "DP2";

/** O código da lotação tributária única que o DP 2 usa por empresa (S-1020). */
export const LOTACAO_PADRAO = "LOT001";

export type TipoDeEvento = "S-1000" | "S-1005" | "S-1010" | "S-1020" | "S-1200" | "S-1210" | "S-1299" | "S-2200" | "S-2206" | "S-2230" | "S-2299";

export const NOME_DO_EVENTO: Record<TipoDeEvento, string> = {
  "S-1000": "Informações do empregador",
  "S-1005": "Estabelecimento",
  "S-1010": "Rubrica",
  "S-1020": "Lotação tributária",
  "S-1200": "Remuneração do trabalhador",
  "S-1210": "Pagamentos",
  "S-1299": "Fechamento dos periódicos",
  "S-2200": "Admissão",
  "S-2206": "Alteração contratual",
  "S-2230": "Afastamento",
  "S-2299": "Desligamento",
};

/** O nome do evento no XML e no namespace. */
export const TAG_DO_EVENTO: Record<TipoDeEvento, string> = {
  "S-1000": "evtInfoEmpregador",
  "S-1005": "evtTabEstab",
  "S-1010": "evtTabRubrica",
  "S-1020": "evtTabLotacao",
  "S-1200": "evtRemun",
  "S-1210": "evtPgtos",
  "S-1299": "evtFechaEvPer",
  "S-2200": "evtAdmissao",
  "S-2206": "evtAltContratual",
  "S-2230": "evtAfastTemp",
  "S-2299": "evtDeslig",
};

/** Grupo do lote: 1 = tabelas, 2 = não periódicos, 3 = periódicos. */
export const GRUPO_DO_EVENTO: Record<TipoDeEvento, "1" | "2" | "3"> = {
  "S-1000": "1",
  "S-1005": "1",
  "S-1010": "1",
  "S-1020": "1",
  "S-1200": "3",
  "S-1210": "3",
  "S-1299": "3",
  "S-2200": "2",
  "S-2206": "2",
  "S-2230": "2",
  "S-2299": "2",
};

export function namespaceDoEvento(tipo: TipoDeEvento): string {
  return `http://www.esocial.gov.br/schema/evt/${TAG_DO_EVENTO[tipo]}/${VERSAO_DO_LEIAUTE}`;
}

export const NAMESPACE_DO_LOTE = "http://www.esocial.gov.br/schema/lote/eventos/envio/v1_1_1";

/** Máximo de eventos por lote (Manual de Orientação do Desenvolvedor). */
export const EVENTOS_POR_LOTE = 50;
