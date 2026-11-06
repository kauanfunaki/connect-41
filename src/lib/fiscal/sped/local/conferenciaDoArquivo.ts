// O que o agente do motor exige para gerar o EFD ICMS/IPI e que o Connect
// confere antes de pôr o pedido na fila (06/11/2026). Sem isto, a pessoa só
// sabia que faltava a inscrição estadual depois que a máquina pegava a tarefa e
// recusava. Espelha a conferência do gerador do motor (`gerador_connect_icms.py`,
// `_empresa` e `_participante`, sped_generator#59): mudou lá, muda aqui.
//
// Puro, sem banco. O motor continua conferindo tudo de novo; esta é a parte que
// dá para resolver no Connect antes do pedido.

import type { Escrituracao } from "./escrituracaoXml";

/** Onde a pessoa resolve: o cadastro da empresa ou a importação do XML. */
export type OndeResolver = "cadastro" | "importacao";
export type GrupoDeFaltas = { onde: OndeResolver; itens: string[] };

const SETE_DIGITOS = /^\d{7}$/;
const vazio = (v: string | null | undefined) => !(v ?? "").trim();

/**
 * O cadastro do estabelecimento que o 0000, o 0005 e o 0100 exigem, na ordem
 * das etapas do cadastro da empresa (identificação, endereço, dados fiscais,
 * SPED fiscal). A inscrição estadual sem nenhum dígito ("ISENTO") conta como
 * falta, como no motor. O que o Connect completa pelo XML da própria empresa
 * (endereço, município) e o contabilista padrão do escritório já vêm em `est`.
 */
export function faltasDoEstabelecimento(est: Escrituracao["estabelecimento"], inscricaoEstadual: string): GrupoDeFaltas[] {
  const itens: string[] = [];
  if (vazio(est.razaoSocial)) itens.push("razão social");
  if (vazio(est.cep)) itens.push("CEP");
  if (vazio(est.endereco)) itens.push("endereço");
  if (!/\d/.test(inscricaoEstadual ?? "")) itens.push("inscrição estadual");
  if (vazio(est.indPerfil)) itens.push("perfil");
  if (vazio(est.indAtiv)) itens.push("indicador de atividade");
  if (!SETE_DIGITOS.test(est.codMun)) itens.push("código do município (IBGE)");
  if (vazio(est.contador.nome)) itens.push("nome do contabilista");
  if (vazio(est.contador.cpf)) itens.push("CPF do contabilista");
  if (vazio(est.contador.crc)) itens.push("CRC do contabilista");
  return itens.length ? [{ onde: "cadastro", itens }] : [];
}

type DocumentoDoPacote = { id: string; numero: string; emitente: string; destinatario: string; cnpjEmpresa: string };

/**
 * Os documentos que o motor não consegue escriturar por falta de dado: sem o
 * XML guardado (vieram do TXT ou o arquivo saiu do disco), ou com a outra parte
 * sem endereço ou município — o PVA recusa o 0150 assim.
 */
export function faltasDosDocumentos(documentos: readonly DocumentoDoPacote[], esc: Escrituracao): GrupoDeFaltas[] {
  const comXml = new Set(esc.documentos.map((d) => d.id));
  const participantes = new Map(esc.participantes.map((p) => [p.documento, p]));
  const semXml = new Set<string>(), semEndereco = new Set<string>();
  for (const d of documentos) {
    if (!comXml.has(d.id)) { semXml.add(d.numero); continue; }
    const outra = d.emitente === d.cnpjEmpresa ? d.destinatario : d.emitente;
    if (!outra) continue;
    const p = participantes.get(outra);
    if (!p || vazio(p.endereco) || !SETE_DIGITOS.test(p.codMun)) semEndereco.add(d.numero);
  }
  const exemplos = (numeros: Set<string>) => {
    const lista = [...numeros].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
    return `${lista.slice(0, 3).join(", ")}${lista.length > 3 ? ` e mais ${lista.length - 3}` : ""}`;
  };
  const itens = [
    ...(semXml.size ? [`${semXml.size === 1 ? "o XML da nota" : `o XML de ${semXml.size} notas`} ${exemplos(semXml)}`] : []),
    ...(semEndereco.size ? [`o endereço ou o município da outra parte ${semEndereco.size === 1 ? "da nota" : `de ${semEndereco.size} notas`} ${exemplos(semEndereco)}`] : []),
  ];
  return itens.length ? [{ onde: "importacao", itens }] : [];
}

const ONDE: Record<OndeResolver, string> = { cadastro: "no cadastro da empresa", importacao: "na importação" };

/** A frase da recusa: "Antes de gerar o EFD ICMS/IPI, complete no cadastro da empresa, …; na importação, …". */
export function mensagemDasFaltas(grupos: readonly GrupoDeFaltas[]): string {
  const partes = grupos.map((g) => `${ONDE[g.onde]}, ${g.itens.join(", ")}`);
  return `Antes de gerar o EFD ICMS/IPI, complete ${partes.join("; ")}.`;
}
