// A busca em todas as empresas de Colaboradores de clientes (14/10/2026).
//
// A tela abre numa empresa só — são cerca de 4 mil pessoas em ~400 empresas,
// e abrir a lista inteira não servia para nada. Mas quem procura alguém nem
// sempre sabe a empresa: a busca por nome ou CPF continua valendo em todas,
// **com teto** (`LIMITE_DA_BUSCA`). Uma letra digitada não pode trazer as 4 mil.

import { formatCpf } from "@/lib/format";

/** Quantas pessoas a busca em todas as empresas mostra, no máximo. */
export const LIMITE_DA_BUSCA = 50;

/** O termo da URL, limpo; vazio é "sem busca". */
export function termoDaBusca(bruto: string | string[] | undefined): string | null {
  const t = (Array.isArray(bruto) ? bruto[0] : bruto)?.trim() ?? "";
  return t === "" ? null : t;
}

type CondicaoDaBusca = { name: { contains: string } } | { cpf: { contains: string } };

/**
 * O `where` do Prisma para o termo: o nome contém o termo, ou — quando o termo
 * tem três dígitos ou mais — o CPF contém os dígitos. O CPF é gravado como foi
 * digitado no formulário (às vezes "123.456.789-09", às vezes só os números),
 * então o CPF inteiro também é procurado com a máscara.
 */
export function ondeDaBusca(termo: string): { OR: CondicaoDaBusca[] } {
  const ou: CondicaoDaBusca[] = [{ name: { contains: termo } }];
  const digitos = termo.replace(/\D/g, "");
  if (digitos.length >= 3) {
    ou.push({ cpf: { contains: digitos } });
    if (digitos.length === 11) ou.push({ cpf: { contains: formatCpf(digitos) } });
    else if (termo !== digitos) ou.push({ cpf: { contains: termo } });
  }
  return { OR: ou };
}

/**
 * Corta o que veio do banco no limite. A consulta pede um a mais
 * (`LIMITE_DA_BUSCA + 1`) só para saber se havia mais gente — e a tela pede
 * para digitar mais do nome.
 */
export function cortarBusca<T>(linhas: T[], limite = LIMITE_DA_BUSCA): { itens: T[]; temMais: boolean } {
  return { itens: linhas.slice(0, limite), temMais: linhas.length > limite };
}

/** O que a tela mostra: a busca em todas, a empresa escolhida, ou o pedido de escolher. */
export type ModoDaTela = "busca" | "empresa" | "escolher";

/**
 * A busca ganha da empresa: com termo digitado, a tela mostra o resultado em
 * todas as empresas. Sem termo, a empresa escolhida (da URL ou a última
 * aberta); sem nenhuma, o pedido de escolher — nunca a primeira da lista.
 */
export function modoDaTela(busca: string | null, escolha: { tipo: "empresa" | "todas" | "escolher" }): ModoDaTela {
  if (busca) return "busca";
  return escolha.tipo === "empresa" ? "empresa" : "escolher";
}
