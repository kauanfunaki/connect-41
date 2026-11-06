// O que o agente do motor exige para gerar o EFD ICMS/IPI e que o Connect
// confere antes de pôr o pedido na fila (06/11/2026). Sem isto, a pessoa só
// sabia que faltava a inscrição estadual depois que a máquina pegava a tarefa e
// recusava. Espelha a conferência do gerador do motor (`gerador_connect_icms.py`,
// `_empresa` e `_participante`, sped_generator#59): mudou lá, muda aqui.
//
// Puro, sem banco. O motor continua conferindo tudo de novo; esta é a parte que
// dá para resolver no Connect antes do pedido.

import type { Escrituracao } from "./escrituracaoXml";

/** Onde a pessoa resolve: o perfil fiscal (nesta tela), o cadastro da empresa ou a importação do XML. */
export type OndeResolver = "perfil" | "cadastro" | "importacao";
export type GrupoDeFaltas = { onde: OndeResolver; itens: string[] };

const SETE_DIGITOS = /^\d{7}$/;
const vazio = (v: string | null | undefined) => !(v ?? "").trim();

/**
 * O cadastro do estabelecimento que o 0000, o 0005 e o 0100 exigem. A
 * inscrição estadual sem nenhum dígito ("ISENTO") conta como falta, como no
 * motor. O que o Connect completa pelo XML da própria empresa (endereço,
 * município) já vem completado em `est`.
 */
export function faltasDoEstabelecimento(est: Escrituracao["estabelecimento"], inscricaoEstadual: string): GrupoDeFaltas[] {
  const perfil: string[] = [], cadastro: string[] = [];
  if (!/\d/.test(inscricaoEstadual ?? "")) perfil.push("inscrição estadual");
  if (!SETE_DIGITOS.test(est.codMun)) perfil.push("código do município (IBGE)");
  if (vazio(est.indPerfil)) perfil.push("perfil de apresentação");
  if (vazio(est.indAtiv)) perfil.push("atividade");
  if (vazio(est.contador.nome)) perfil.push("nome do contador");
  if (vazio(est.contador.cpf)) perfil.push("CPF do contador");
  if (vazio(est.contador.crc)) perfil.push("CRC do contador");
  if (vazio(est.razaoSocial)) cadastro.push("razão social");
  if (vazio(est.cep)) cadastro.push("CEP");
  if (vazio(est.endereco)) cadastro.push("endereço");
  return [...(perfil.length ? [{ onde: "perfil" as const, itens: perfil }] : []), ...(cadastro.length ? [{ onde: "cadastro" as const, itens: cadastro }] : [])];
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
  return [
    ...(semXml.size ? [{ onde: "importacao" as const, itens: [`${semXml.size === 1 ? "o XML da nota" : `o XML de ${semXml.size} notas`} ${exemplos(semXml)}`] }] : []),
    ...(semEndereco.size ? [{ onde: "importacao" as const, itens: [`o endereço ou o município da outra parte ${semEndereco.size === 1 ? "da nota" : `de ${semEndereco.size} notas`} ${exemplos(semEndereco)}`] }] : []),
  ];
}

const ONDE: Record<OndeResolver, string> = { perfil: "no perfil fiscal", cadastro: "no cadastro da empresa", importacao: "na importação" };

/** A frase da recusa: "Antes de gerar, complete no perfil fiscal: …; no cadastro da empresa: …". */
export function mensagemDasFaltas(grupos: readonly GrupoDeFaltas[]): string {
  const partes = grupos.map((g) => `${ONDE[g.onde]}, ${g.itens.join(", ")}`);
  return `Antes de gerar o EFD ICMS/IPI, complete ${partes.join("; ")}.`;
}
