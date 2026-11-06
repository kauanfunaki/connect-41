// Os dados do SPED no cadastro de empresa (06/11/2026): registros 0000, 0005 e
// 0100 da EFD ICMS/IPI e o COD_CTA/COD_INF dos lançamentos. Regra pura — sem
// Prisma —, usada pelo formulário, pela action e pela configuração do escritório.
//
// Nenhum campo é obrigatório: o cadastro salva com todos vazios. O formato só
// é conferido quando o campo vem preenchido.
//
// Os textos das dicas não citam escritório, contador nem sistema contábil
// específico: o Connect é vendido a outros escritórios. O que for padrão de um
// escritório (o contabilista) vem da configuração dele (`TenantSpedConfig`).

import { isValidCPF } from "@/lib/validation/common";

export type DadosSped = {
  codMunicipioIbge: string | null;
  spedIndPerfil: string | null;
  spedIndAtividade: string | null;
  contabilistaNome: string | null;
  contabilistaCpf: string | null;
  contabilistaCrc: string | null;
  spedContaContabilPadrao: string | null;
  spedCodObservacaoPadrao: string | null;
};

export type Contabilista = Pick<DadosSped, "contabilistaNome" | "contabilistaCpf" | "contabilistaCrc">;

export const CAMPOS_SPED = [
  "codMunicipioIbge",
  "spedIndPerfil",
  "spedIndAtividade",
  "contabilistaNome",
  "contabilistaCpf",
  "contabilistaCrc",
  "spedContaContabilPadrao",
  "spedCodObservacaoPadrao",
] as const satisfies readonly (keyof DadosSped)[];

export const PERFIS = ["A", "B", "C"] as const;

export const ATIVIDADES = [
  { valor: "0", rotulo: "0 — Industrial ou equiparado a industrial" },
  { valor: "1", rotulo: "1 — Outros (comércio, serviço, transporte…)" },
] as const;

/**
 * IND_ATIV pelo CNAE principal: indústria de transformação e extrativa (seções
 * B e C, divisões 05 a 33) é "0"; o resto é "1". Sem CNAE legível, nada.
 */
export function atividadePeloCnae(cnae: string | number | null | undefined): "0" | "1" | null {
  const digitos = String(cnae ?? "").replace(/\D/g, "");
  if (digitos.length < 2) return null;
  const divisao = Number(digitos.slice(0, 2));
  return divisao >= 5 && divisao <= 33 ? "0" : "1";
}

/** CNAE da BrasilAPI (número `4930202`) no formato do cadastro: `4930-2/02`. */
export function formatarCnae(cnae: string | number | null | undefined): string {
  const d = String(cnae ?? "").replace(/\D/g, "");
  if (d.length !== 7) return d;
  return `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5)}`;
}

function texto(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function soDigitos(v: string | null): string | null {
  const d = v?.replace(/\D/g, "") ?? "";
  return d || null;
}

/** Contabilista de um FormData (campos com os mesmos nomes do Company). */
export function contabilistaDoFormulario(form: FormData): Contabilista {
  return {
    contabilistaNome: texto(form.get("contabilistaNome")),
    contabilistaCpf: soDigitos(texto(form.get("contabilistaCpf"))),
    contabilistaCrc: texto(form.get("contabilistaCrc"))?.toUpperCase().replace(/\s+/g, "") ?? null,
  };
}

/** Os campos do SPED de um FormData, já normalizados (dígitos, maiúsculas). */
export function dadosSpedDoFormulario(form: FormData): DadosSped {
  return {
    codMunicipioIbge: soDigitos(texto(form.get("codMunicipioIbge"))),
    spedIndPerfil: texto(form.get("spedIndPerfil"))?.toUpperCase() ?? null,
    spedIndAtividade: texto(form.get("spedIndAtividade")),
    ...contabilistaDoFormulario(form),
    spedContaContabilPadrao: texto(form.get("spedContaContabilPadrao")),
    spedCodObservacaoPadrao: texto(form.get("spedCodObservacaoPadrao")),
  };
}

/** Confere o contabilista; vazio é válido. */
export function erroDoContabilista(c: Contabilista): string | null {
  if (c.contabilistaCpf && !isValidCPF(c.contabilistaCpf)) return "CPF do contabilista inválido.";
  if (c.contabilistaCrc && c.contabilistaCrc.length > 20) return "CRC do contabilista com mais de 20 caracteres.";
  if (c.contabilistaNome && c.contabilistaNome.length > 100) return "Nome do contabilista com mais de 100 caracteres.";
  return null;
}

/** Confere o formato do que veio preenchido; tudo vazio é válido. */
export function erroDosDadosSped(d: DadosSped): string | null {
  if (d.codMunicipioIbge && !/^\d{7}$/.test(d.codMunicipioIbge)) return "O código IBGE do município tem 7 dígitos.";
  if (d.spedIndPerfil && !(PERFIS as readonly string[]).includes(d.spedIndPerfil)) return "O perfil é A, B ou C.";
  if (d.spedIndAtividade && !["0", "1"].includes(d.spedIndAtividade)) return "O indicador de atividade é 0 ou 1.";
  if (d.spedContaContabilPadrao && d.spedContaContabilPadrao.length > 60) return "Conta contábil padrão com mais de 60 caracteres.";
  if (d.spedCodObservacaoPadrao && d.spedCodObservacaoPadrao.length > 60) return "Código de observação com mais de 60 caracteres.";
  return erroDoContabilista(d);
}

/** O que o cadastro da empresa tem e o estabelecimento do motor também pede. */
export type CadastroParaMotor = DadosSped & {
  name: string | null;
  tradeName: string | null;
  stateRegistration: string | null;
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  phone: string | null;
  email: string | null;
};

/**
 * Os campos do estabelecimento no motor (`PUT /empresas/{id}`) que o cadastro
 * da empresa sabe, no formato dele: CEP e telefone só com dígitos. Vazio fica
 * de fora — nunca sugere apagar o que o motor já tem.
 */
export function camposDoMotorPeloCadastro(c: CadastroParaMotor): Record<string, string> {
  const digitos = (v: string | null) => v?.replace(/\D/g, "") || null;
  const pares: [string, string | null][] = [
    ["razao_social", c.name],
    ["nome_fantasia", c.tradeName],
    ["ie", digitos(c.stateRegistration)],
    ["ind_perfil", c.spedIndPerfil],
    ["ind_ativ", c.spedIndAtividade],
    ["cep", digitos(c.zipCode)],
    ["endereco", c.addressStreet],
    ["numero", c.addressNumber],
    ["complemento", c.addressComplement],
    ["bairro", c.neighborhood],
    ["cod_mun", c.codMunicipioIbge],
    ["telefone", digitos(c.phone)],
    ["email", c.email],
    ["resp_nome", c.contabilistaNome],
    ["resp_cpf", c.contabilistaCpf],
    ["resp_crc", c.contabilistaCrc],
    ["cod_cta", c.spedContaContabilPadrao],
    ["cod_inf", c.spedCodObservacaoPadrao],
  ];
  return Object.fromEntries(pares.filter((p): p is [string, string] => !!p[1]?.trim()));
}

/**
 * A dica do "?" de cada campo: o que é e onde quem cadastra acha o dado. Só
 * fontes que essa pessoa acessa — nunca o SPED gerado nem o motor.
 */
export const DICAS_SPED = {
  spedIndPerfil:
    "Perfil de apresentação que a SEFAZ do estado exige da empresa (A, B ou C). Consulte o portal da SEFAZ da UF, na página da EFD ICMS/IPI, ou o fiscal responsável pelo cliente.",
  spedIndAtividade:
    "0 = industrial ou equiparado a industrial; 1 = outros (comércio, serviço, transporte). Sai do CNAE principal do cartão CNPJ e é sugerido sozinho ao digitar o CNPJ.",
  contabilistaNome:
    "Contabilista que assina pela empresa. Vem preenchido com o padrão da configuração do escritório, se houver. Em branco, o arquivo usa esse padrão.",
  contabilistaCpf: "CPF do contabilista que assina pela empresa, só os números.",
  contabilistaCrc:
    "Registro do contabilista no CRC, como está na carteira: número, tipo e UF (ex.: 012345O1PR; \"O\" = originário).",
  spedContaContabilPadrao:
    "Conta de receita do serviço no plano de contas da empresa, no sistema contábil usado pelo escritório. Informe o código completo da conta.",
  spedCodObservacaoPadrao:
    "Opcional. Código de observação (informação complementar) usado nos lançamentos da empresa. Deixe em branco se não houver.",
  codMunicipioIbge:
    "Código do município com 7 dígitos. Preenchido sozinho pelo CNPJ ou pelo CEP; se faltar, consulte em cidades.ibge.gov.br.",
  stateRegistration:
    "Não vem pelo CNPJ. Consulte o SINTEGRA ou o cadastro de contribuintes da SEFAZ da UF, ou o comprovante de inscrição do cliente.",
  phone: "Telefone de contato da empresa. Vem do cartão CNPJ da Receita; pode ser o do escritório, se a empresa usar.",
  email: "E-mail de contato da empresa. Vem do cartão CNPJ da Receita; pode ser o do escritório, se a empresa usar.",
} as const;
