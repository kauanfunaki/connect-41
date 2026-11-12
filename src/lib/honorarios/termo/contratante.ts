// O termo aditivo em Word (funcionalidade-643, 12/11/2026) — o que o Aditiva
// Pronto fazia em `textBuilderService.ts`: o parágrafo do CONTRATANTE, montado
// com o cadastro da empresa no Connect.
//
// Decisões do Kauan (12/11/2026):
// - os dados vêm do cadastro: endereço da empresa, o sócio administrador em
//   Sócios (com nacionalidade, estado civil e profissão, novos no sócio) e os
//   contatos administrativo e financeiro, novos na empresa. A tela do termo
//   mostra o que falta e grava no cadastro;
// - o modelo .docx é do escritório, enviado na tela;
// - o termo gerado vai para os Arquivos da empresa e é baixado na hora.
//
// A regra do Aditiva continua: bloco opcional incompleto não entra, para o
// texto não sair com vírgula solta ou "Bairro ," no meio.

import { formatCep, formatCnpj, formatCpf, formatPhone } from "@/lib/format";
import { lerDocumentoFiscal } from "@/lib/companyTaxId";

export type EnderecoDoTermo = {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
};

export type SocioDoTermo = {
  nome: string;
  /** Só dígitos, ou o que estiver no cadastro. */
  cpf: string | null;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  endereco: EnderecoDoTermo;
};

export type ContatoDoTermo = { nome: string | null; telefone: string | null; email: string | null };

/** Os contatos do contrato que a empresa tem (um de cada). */
export const PAPEIS_DE_CONTATO = ["ADMINISTRATIVO", "FINANCEIRO"] as const;
export type PapelDoContato = (typeof PAPEIS_DE_CONTATO)[number];

/** O que a tela do termo grava no cadastro. */
export type EntradaDoContratante = {
  companyId: string;
  endereco: EnderecoDoTermo;
  /** O sócio que assina; "novo" cadastra um sócio administrador. */
  socioId: string;
  socio: {
    nome: string;
    /** Só dígitos, já conferido. */
    cpf: string;
    nacionalidade: string | null;
    estadoCivil: string | null;
    profissao: string | null;
    endereco: EnderecoDoTermo;
  };
  contatos: Record<PapelDoContato, ContatoDoTermo>;
};

export type DadosDoContratante = {
  razaoSocial: string;
  cnpj: string | null;
  endereco: EnderecoDoTermo;
  socio: SocioDoTermo | null;
  administrativo: ContatoDoTermo | null;
  financeiro: ContatoDoTermo | null;
};

const cheio = (v: string | null | undefined): v is string => !!v && v.trim().length > 0;
const todos = (...vs: (string | null | undefined)[]) => vs.every(cheio);

function enderecoCompleto(e: EnderecoDoTermo): boolean {
  return todos(e.logradouro, e.numero, e.bairro, e.cidade, e.uf, e.cep);
}

function contatoCompleto(c: ContatoDoTermo | null): c is { nome: string; telefone: string; email: string } {
  return !!c && todos(c.nome, c.telefone, c.email);
}

/** "nº 120, sala 4": o complemento do Connect entra depois do número, quando há. */
function numeroComComplemento(e: EnderecoDoTermo): string {
  return cheio(e.complemento) ? `${e.numero!.trim()}, ${e.complemento.trim()}` : e.numero!.trim();
}

export type Falta = { campo: string; obrigatoria: boolean };

/**
 * O que falta para o termo. Obrigatório impede gerar (sem sócio ou CPF não há
 * quem assine); o resto só deixa o trecho de fora do texto, como no Aditiva.
 */
export function oQueFalta(d: DadosDoContratante): Falta[] {
  const faltas: Falta[] = [];
  if (lerDocumentoFiscal(d.cnpj)?.tipo !== "CNPJ") faltas.push({ campo: "CNPJ válido da empresa", obrigatoria: true });
  if (!d.socio) faltas.push({ campo: "Sócio administrador", obrigatoria: true });
  else if (lerDocumentoFiscal(d.socio.cpf)?.tipo !== "CPF") faltas.push({ campo: "CPF válido do sócio", obrigatoria: true });
  if (!enderecoCompleto(d.endereco)) faltas.push({ campo: "Endereço completo da empresa", obrigatoria: false });
  if (d.socio && !todos(d.socio.nacionalidade, d.socio.estadoCivil, d.socio.profissao)) {
    faltas.push({ campo: "Nacionalidade, estado civil e profissão do sócio", obrigatoria: false });
  }
  if (d.socio && !enderecoCompleto(d.socio.endereco)) faltas.push({ campo: "Endereço completo do sócio", obrigatoria: false });
  if (!contatoCompleto(d.administrativo)) faltas.push({ campo: "Contato administrativo (nome, telefone e e-mail)", obrigatoria: false });
  if (!contatoCompleto(d.financeiro)) faltas.push({ campo: "Contato financeiro (nome, telefone e e-mail)", obrigatoria: false });
  return faltas;
}

export function podeGerar(d: DadosDoContratante): boolean {
  return oQueFalta(d).every((f) => !f.obrigatoria);
}

/**
 * O parágrafo do CONTRATANTE, com a mesma redação do Aditiva Pronto. Só chamar
 * quando `podeGerar` — sem sócio, o texto não tem quem represente a empresa.
 */
export function textoDoContratante(d: DadosDoContratante): string {
  const s = d.socio;
  if (!s) throw new Error("Sem sócio administrador para o termo.");
  const e = d.endereco;
  let t = `${d.razaoSocial.trim()}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${formatCnpj(d.cnpj)}`;
  if (enderecoCompleto(e)) {
    t += `, estabelecida na ${e.logradouro!.trim()}, n° ${numeroComComplemento(e)}, Bairro ${e.bairro!.trim()} – ${e.cidade!.trim()}/${e.uf!.trim().toUpperCase()}, CEP ${formatCep(e.cep)}`;
  }
  t += `, neste ato representado por seu Sócio Administrador ${s.nome.trim()}`;
  if (todos(s.nacionalidade, s.estadoCivil, s.profissao)) {
    t += `, ${s.nacionalidade!.trim()}, ${s.estadoCivil!.trim()}, ${s.profissao!.trim()}`;
  }
  t += `, portador do CPF ${formatCpf(s.cpf)}`;
  const es = s.endereco;
  if (enderecoCompleto(es)) {
    t += `, residente e domiciliado na ${es.logradouro!.trim()}, n° ${numeroComComplemento(es)}, Bairro ${es.bairro!.trim()}, Cidade ${es.cidade!.trim()} – ${es.uf!.trim().toUpperCase()}, CEP ${formatCep(es.cep)}`;
  }
  const contatos: string[] = [];
  if (contatoCompleto(d.administrativo)) {
    const c = d.administrativo;
    contatos.push(`Contato administrativo: ${c.nome.trim()} ${formatPhone(c.telefone)}, E-mail: ${c.email.trim()}`);
  }
  if (contatoCompleto(d.financeiro)) {
    const c = d.financeiro;
    contatos.push(`Contato financeiro: ${c.nome.trim()} ${formatPhone(c.telefone)}, E-mail: ${c.email.trim()}`);
  }
  return contatos.length > 0 ? `${t}. ${contatos.join(". ")};` : `${t}.`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Curitiba, 05 de maio de 2026." — a data do dia em São Paulo, como no Aditiva. */
export function dataDoDocumento(cidade: string, agora: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(agora)
      .map((x) => [x.type, x.value])
  );
  return `${cidade.trim()}, ${p.day} de ${MESES[Number(p.month) - 1]} de ${p.year}.`;
}

/** Os campos do modelo, com os mesmos nomes do Aditiva: o .docx de lá serve sem mudança. */
export const CAMPOS_DO_MODELO = ["CONTRATANTE_TEXTO", "DATA_DOCUMENTO", "NOME_SOCIO_ASSINATURA"] as const;

export function dadosDoModelo(d: DadosDoContratante, cidade: string, agora: Date): Record<(typeof CAMPOS_DO_MODELO)[number], string> {
  return {
    CONTRATANTE_TEXTO: textoDoContratante(d),
    DATA_DOCUMENTO: dataDoDocumento(cidade, agora),
    NOME_SOCIO_ASSINATURA: d.socio!.nome.trim().toUpperCase(),
  };
}

/** "Termo_Aditivo_EMPRESA_EXEMPLO_LTDA_11222333000181.docx", como o Aditiva nomeava. */
export function nomeDoArquivo(razaoSocial: string, cnpj: string | null): string {
  const seguro = razaoSocial
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase()
    .slice(0, 80);
  return `Termo_Aditivo_${seguro}_${(cnpj ?? "").replace(/\D/g, "")}.docx`;
}
