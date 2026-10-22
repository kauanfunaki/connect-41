// Do JSON do motor SPED para o modelo da prévia (API-CONNECT §8.3, 22/10/2026).
//
// Adaptador puro: as telas reais reaproveitam os rótulos e os tipos da prévia
// (`ExecucaoTeste`, `ArquivoTeste`...) sem que o `cenarioSchema` de teste mude.
// O que o motor não tem **fica de fora**, e a tela esconde o campo — nunca um
// número inventado ao lado de um real (resumo, tentativaDe, documentos).

import type { ArquivoDoMotor, CorpoDeExecucao, DecisaoDoMotor, EmpresaDoMotor, ExecucaoDoMotor, ValidacaoDoMotor } from "@/lib/sped/motor";
import type { ArquivoTeste, Cenario, ExecucaoTeste } from "./cenario";
import { geracao, mesInteiro, type ParametrosExecucao } from "./execucao";

const MODOS = ["paralela", "simples", "erros", "sped", "sped_contribuicoes"] as const;
type Modo = (typeof MODOS)[number];
const ehModo = (v: string): v is Modo => (MODOS as readonly string[]).includes(v);

export const ESTADO_DA_EXECUCAO: Record<ExecucaoDoMotor["estado"], ExecucaoTeste["estado"]> = {
  pendente: "Na fila", executando: "Executando", concluida: "Concluída", erro: "Erro", cancelada: "Cancelada",
};

const bool = (v: unknown) => v === true;
const inteiro = (v: unknown, padrao: number) => (typeof v === "number" && Number.isInteger(v) ? v : padrao);

/** A execução do motor no modelo da prévia. `log` vem à parte, só no detalhe. */
export function execucaoDoMotor(e: ExecucaoDoMotor, empresaId: string, log: string[] = []): ExecucaoTeste {
  const p = e.parametros;
  const etapas = Array.isArray(p.step_types) ? p.step_types.filter((s): s is "first_mile" | "last_mile" => s === "first_mile" || s === "last_mile") : [];
  const parametros: ParametrosExecucao | undefined = ehModo(e.acao) ? {
    modo: e.acao,
    dataIni: e.data_ini,
    dataFim: e.data_fim,
    solicitante: e.solicitado_por ?? "",
    etapas,
    semEntradas: bool(p.sem_entradas),
    instancias: inteiro(p.instancias, 1),
    workers: inteiro(p.workers, 1),
    ...(geracao(e.acao) ? { tipoSped: bool(p.retificadora) ? "1" as const : "0" as const } : {}),
    saida: typeof p.saida === "string" ? p.saida : "",
    forcarErros: bool(p.forcar_com_erros),
    forcarCobertura: bool(p.forcar_cobertura),
  } : undefined;
  return {
    id: String(e.id),
    contexto: { empresaId, estabelecimentoId: e.empresa_id === null ? "" : String(e.empresa_id), competencia: e.competencia ?? e.data_ini.slice(0, 7) },
    acao: e.acao,
    estado: ESTADO_DA_EXECUCAO[e.estado],
    criadoEm: e.solicitado_em ?? e.iniciado_em ?? "",
    log,
    ...(parametros ? { parametros } : {}),
    ...(e.iniciado_em ? { iniciadoEm: e.iniciado_em } : {}),
    ...(e.concluido_em ? { concluidoEm: e.concluido_em } : {}),
    arquivoIds: e.arquivo_ids.map(String),
  };
}

/** Situação da validação no rótulo da prévia (§8.3). */
export function validacaoDoArquivo(v: ArquivoDoMotor["validacao"]): ArquivoTeste["validacao"] {
  if (v.estado === "ok" && !v.erros) return "Aprovado";
  if (v.estado === "ok" || v.estado === "erro") return "Com pendências";
  return "Não validado";
}

/** O arquivo do motor no modelo da prévia. `erros` só no detalhe, da rodada de validação. */
export function arquivoDoMotor(a: ArquivoDoMotor, empresaId: string, erros: string[] = []): ArquivoTeste {
  return {
    id: String(a.id),
    contexto: { empresaId, estabelecimentoId: a.empresa_id === null ? "" : String(a.empresa_id), competencia: a.competencia },
    tipo: a.obrigacao === "icms_ipi" ? "ICMS/IPI" : "Contribuições",
    versao: a.versao,
    nome: a.nome_arquivo,
    revisao: String(a.decisao_ate ?? ""),
    criadoEm: a.gerado_em,
    validacao: validacaoDoArquivo(a.validacao),
    erros,
    entregue: a.entrega.estado === "registrada",
    protocolo: a.entrega.recibo ?? "",
    dominio: a.entrega.estado === "dominio",
    ...(a.retificadora === null ? {} : { tipoSped: a.retificadora ? "1" as const : "0" as const }),
    ...(a.execucao_id ? { execucaoId: String(a.execucao_id) } : {}),
  };
}

/**
 * A situação que a lista mostra. Com dado real, **`defasado` substitui o
 * `precisaRevisar`** da prévia; quando o motor só estima (legado), o selo diz.
 */
export function situacaoDoArquivo(a: ArquivoDoMotor): string {
  if (a.defasado) return a.defasado_fonte === "legado" ? "Revisão necessária (estimativa)" : "Revisão necessária";
  if (a.entrega.estado === "registrada") return "Entregue";
  if (a.validacao.estado === "validando") return "Validando";
  return validacaoDoArquivo(a.validacao);
}

/**
 * As mensagens de erro de uma rodada de validação, até 20 (§8.3). O motor
 * devolve os `achados` como `db.buscar_validacao`; a severidade e o texto são
 * lidos pelos nomes mais prováveis, e achado sem texto não vira linha vazia.
 */
export function errosDaValidacao(v: ValidacaoDoMotor, limite = 20): string[] {
  const saida: string[] = [];
  for (const a of v.achados) {
    const severidade = String(a.severidade ?? a.nivel ?? a.tipo ?? "").toLowerCase();
    if (!severidade.startsWith("erro") && severidade !== "e") continue;
    const texto = [a.mensagem, a.descricao, a.texto].find((t): t is string => typeof t === "string" && t.trim() !== "");
    if (!texto) continue;
    const onde = typeof a.registro === "string" && a.registro ? `${a.registro}${a.linha ? ` (linha ${a.linha})` : ""}: ` : "";
    saida.push(`${onde}${texto}`);
    if (saida.length >= limite) break;
  }
  return saida;
}

export type CompanyDoConnect = { id: string; nome: string; cnpj: string; regime: string | null };

/** A empresa da prévia: nome e regime da `Company`; estabelecimentos do motor (§8.3). */
export function empresaDoMotor(company: CompanyDoConnect, estabelecimentos: EmpresaDoMotor[]): Cenario["empresas"][number] {
  return {
    id: company.id,
    nome: company.nome,
    regime: company.regime ?? "—",
    estabelecimentos: estabelecimentos.map((e) => ({ id: String(e.id), nome: e.rotulo, uf: e.uf, cnpj: e.cnpj })),
  };
}

/** Um ajuste do motor no modelo da prévia — o valor vira número só para exibir. */
export function ajusteDoMotor(tipo: "ajuste_apuracao" | "ajuste_contribuicoes", d: DecisaoDoMotor, empresaId: string): Cenario["ajustes"][number] {
  const v = d.valor;
  const s = (x: unknown) => (typeof x === "string" ? x : x === null || x === undefined ? "" : String(x));
  const icms = tipo === "ajuste_apuracao";
  const natureza = s(d.natureza ?? v.natureza);
  return {
    id: s(d.chave.id),
    contexto: { empresaId, estabelecimentoId: s(v.cnpj_empresa), competencia: s(v.competencia) },
    imposto: icms ? "ICMS/IPI" : "Contribuições",
    codigo: icms ? s(v.codigo) : s(v.cod_aj),
    descricao: s(v.descricao),
    valor: Number(s(v.valor)) || 0,
    efeito: icms ? (natureza === "debito" ? "Débito" : "Crédito") : (s(v.operacao) === "credito" ? "Crédito" : "Débito"),
    obrigacao: icms ? "EFD ICMS/IPI" : "EFD Contribuições",
  };
}

/**
 * O sentido contrário: os parâmetros da prévia no corpo de `POST /execucoes`.
 *
 * Só vai o que se aplica à ação, porque o motor recusa chave desconhecida e
 * `execucoes_fila.validar` ignora o resto. O `solicitante` não vai: quem pede
 * é o ator da sessão. Período de mês inteiro vai como `competencia`.
 */
export function corpoDeExecucao(p: ParametrosExecucao, empresaId: number, confirmarDuplicado = false): CorpoDeExecucao {
  const [ini, fim] = mesInteiro(p.dataIni.slice(0, 7));
  const mesFechado = p.dataIni === ini && p.dataFim === fim;
  const periodo = mesFechado ? { competencia: p.dataIni.slice(0, 7) } : { data_ini: p.dataIni, data_fim: p.dataFim };
  let parametros: Record<string, unknown>;
  if (p.modo === "sped") parametros = { saida: p.saida, forcar_com_erros: p.forcarErros, forcar_cobertura: p.forcarCobertura };
  else if (p.modo === "sped_contribuicoes") parametros = {};
  else parametros = {
    ...(p.modo === "paralela" ? { instancias: p.instancias } : {}),
    workers: p.workers,
    step_types: p.etapas,
    sem_entradas: p.semEntradas,
  };
  return {
    acao: p.modo,
    empresa_id: empresaId,
    ...periodo,
    ...(geracao(p.modo) ? { tipo_sped: p.tipoSped ?? "0" } : {}),
    parametros,
    confirmar_duplicado: confirmarDuplicado,
  };
}

/** Totais do detalhe do arquivo, achatados para uma tabela "campo → valor" com os nomes do motor. */
export function linhasDosTotais(totais: Record<string, unknown> | null): { campo: string; valor: string }[] {
  if (!totais) return [];
  const saida: { campo: string; valor: string }[] = [];
  const andar = (prefixo: string, v: unknown, fundo: number) => {
    if (v && typeof v === "object" && !Array.isArray(v) && fundo < 3) {
      for (const [k, filho] of Object.entries(v)) andar(prefixo ? `${prefixo} · ${k}` : k, filho, fundo + 1);
    } else if (v !== null && v !== undefined && typeof v !== "object") {
      saida.push({ campo: prefixo, valor: String(v) });
    }
  };
  andar("", totais, 0);
  return saida.slice(0, 200);
}
