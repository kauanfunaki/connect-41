// A ficha da contraparte além de nome e documento (19/10) — o que o BPO tinha
// no cadastro de cliente/fornecedor do Omie: fantasia, contato, endereço e
// para onde pagar (banco e PIX).
//
// Duas portas de entrada, as duas aqui e puras:
//
// - **a Receita**, pela BrasilAPI (`lerFichaDaReceita`): o pedido 2 do setor —
//   digitar o CNPJ e o resto vir sozinho. É a mesma consulta que o cadastro de
//   empresa e os sócios já fazem;
// - **o formulário** (`validarFicha`): o cadastro de Fornecedores e sacados e a
//   contraparte nova criada no meio de um lançamento ou da conciliação.

import { lerEmail } from "./cobranca/regua";

/** O que a Receita diz de um CNPJ, já no tamanho das colunas da ficha. */
export type FichaDaReceita = {
  cnpj: string;
  /** Razão social. */
  nome: string;
  fantasia: string | null;
  email: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  /** "ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NULA" — como a Receita escreve. */
  situacao: string | null;
  /** Só "ATIVA" é ativa: o resto a tela avisa antes de alguém pagar a empresa. */
  ativa: boolean;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texto = (v: unknown): string => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : typeof v === "number" ? String(v) : "");
const ouNulo = (v: string, max: number): string | null => (v === "" ? null : v.slice(0, max));

/** "80010000" → "80010-000". Fora de oito dígitos, `null`. */
export function formatarCep(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
}

/** "4133334444" ou "41 33334444" → "(41) 33334444", como o cadastro de empresa grava. */
function telefoneDaReceita(valor: unknown): string | null {
  const d = texto(valor).replace(/\D/g, "");
  if (d.length < 10) return null;
  return `(${d.slice(0, 2)}) ${d.slice(2)}`.slice(0, 30);
}

/**
 * O logradouro com o tipo na frente ("RUA XV DE NOVEMBRO"). A BrasilAPI manda
 * os dois separados, e o nome sozinho ("XV DE NOVEMBRO") não diz se é rua ou
 * praça. Não repete o tipo quando o nome já começa com ele.
 */
function logradouroDaReceita(tipo: unknown, nome: unknown): string | null {
  const t = texto(tipo);
  const n = texto(nome);
  if (!n) return null;
  const completo = t && !n.toUpperCase().startsWith(`${t.toUpperCase()} `) ? `${t} ${n}` : n;
  return completo.slice(0, 180);
}

/**
 * A resposta de `brasilapi.com.br/api/cnpj/v1/{cnpj}` como ficha, ou `null`
 * quando não é uma empresa (sem CNPJ ou sem razão social na resposta).
 */
export function lerFichaDaReceita(corpo: unknown): FichaDaReceita | null {
  const d = obj(corpo);
  const cnpj = texto(d.cnpj).replace(/\D/g, "").padStart(14, "0");
  const nome = texto(d.razao_social);
  if (!/^\d{14}$/.test(cnpj) || cnpj === "00000000000000" || !nome) return null;

  const email = lerEmail(texto(d.email));
  const situacao = texto(d.descricao_situacao_cadastral).toUpperCase() || null;
  const uf = texto(d.uf).toUpperCase();
  return {
    cnpj,
    nome: nome.slice(0, 180),
    fantasia: ouNulo(texto(d.nome_fantasia), 180),
    email: email || null,
    telefone: telefoneDaReceita(d.ddd_telefone_1) ?? telefoneDaReceita(d.ddd_telefone_2),
    cep: formatarCep(texto(d.cep)),
    logradouro: logradouroDaReceita(d.descricao_tipo_de_logradouro, d.logradouro),
    numero: ouNulo(texto(d.numero), 20),
    complemento: ouNulo(texto(d.complemento), 80),
    bairro: ouNulo(texto(d.bairro), 80),
    cidade: ouNulo(texto(d.municipio), 80),
    uf: /^[A-Z]{2}$/.test(uf) ? uf : null,
    situacao,
    // Sem situação na resposta não é motivo de alarme: o aviso é para o que a
    // Receita diz que não está ativo, não para o que ela não disse.
    ativa: situacao === null || situacao === "ATIVA",
  };
}

// ─── O formulário ───────────────────────────────────────────────────────────

/** Os campos da ficha como as colunas de `FinanceCounterparty` — e os nomes do formulário. */
export const CAMPOS_DA_FICHA = [
  "tradeName",
  "phone",
  "zipCode",
  "addressStreet",
  "addressNumber",
  "addressComplement",
  "neighborhood",
  "city",
  "stateCode",
  "bankCode",
  "bankAgency",
  "bankAccount",
  "pixKey",
] as const;

export type CampoDaFicha = (typeof CAMPOS_DA_FICHA)[number];
export type DadosDaFicha = Record<CampoDaFicha, string | null>;

/** Teto de cada campo — o `VarChar` da coluna. Passar dele é recusa, não corte: corte calado grava o que ninguém digitou. */
const TAMANHO: Record<CampoDaFicha, number> = {
  tradeName: 180,
  phone: 30,
  zipCode: 10,
  addressStreet: 180,
  addressNumber: 20,
  addressComplement: 80,
  neighborhood: 80,
  city: 80,
  stateCode: 2,
  bankCode: 3,
  bankAgency: 10,
  bankAccount: 30,
  pixKey: 140,
};

const ROTULO: Record<CampoDaFicha, string> = {
  tradeName: "Nome fantasia",
  phone: "Telefone",
  zipCode: "CEP",
  addressStreet: "Logradouro",
  addressNumber: "Número",
  addressComplement: "Complemento",
  neighborhood: "Bairro",
  city: "Cidade",
  stateCode: "UF",
  bankCode: "Banco",
  bankAgency: "Agência",
  bankAccount: "Conta",
  pixKey: "Chave PIX",
};

export const FICHA_VAZIA: DadosDaFicha = Object.fromEntries(CAMPOS_DA_FICHA.map((c) => [c, null])) as DadosDaFicha;

/**
 * Os campos da ficha, validados. `ler` devolve o texto de cada campo — do
 * `FormData`, com ou sem prefixo, conforme quem chama.
 *
 * Normaliza o que tem forma fixa: CEP com hífen, UF em maiúscula, banco com
 * três dígitos ("1" é o "001" do Banco do Brasil, como na conta bancária).
 */
export function validarFicha(ler: (campo: CampoDaFicha) => string): { ok: true; dados: DadosDaFicha } | { ok: false; erro: string } {
  const dados = { ...FICHA_VAZIA };
  for (const campo of CAMPOS_DA_FICHA) {
    const v = ler(campo).trim().replace(/\s+/g, " ");
    if (v === "") continue;
    if (v.length > TAMANHO[campo]) return { ok: false, erro: `${ROTULO[campo]} com mais de ${TAMANHO[campo]} caracteres.` };
    dados[campo] = v;
  }

  if (dados.zipCode) {
    const cep = formatarCep(dados.zipCode);
    if (!cep) return { ok: false, erro: "CEP precisa de oito dígitos." };
    dados.zipCode = cep;
  }
  if (dados.stateCode) {
    const uf = dados.stateCode.toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) return { ok: false, erro: "UF com duas letras, ex.: PR." };
    dados.stateCode = uf;
  }
  if (dados.bankCode) {
    if (!/^\d{1,3}$/.test(dados.bankCode)) return { ok: false, erro: "Banco é o código de três dígitos (ex.: 001, 341)." };
    dados.bankCode = dados.bankCode.padStart(3, "0");
  }
  if (dados.bankAgency && !/^[0-9xX-]+$/.test(dados.bankAgency)) return { ok: false, erro: "Agência aceita só números, hífen e X." };
  if (dados.bankAccount && !/^[0-9xX.-]+$/.test(dados.bankAccount)) return { ok: false, erro: "Conta aceita só números, ponto, hífen e X." };
  return { ok: true, dados };
}

/** Lê os campos da ficha de um `FormData`, com o prefixo da contraparte nova (`ficha_`) ou sem. */
export function leitorDaFicha(formData: FormData, prefixo = ""): (campo: CampoDaFicha) => string {
  return (campo) => {
    const v = formData.get(`${prefixo}${campo}`);
    return typeof v === "string" ? v : "";
  };
}

/**
 * A ficha de uma contraparte nova criada no meio de um lançamento ou da
 * conciliação. Lá a ficha não aparece na tela — vem da Receita, em campos
 * ocultos —, então dado que não valide é descartado em vez de recusar o
 * lançamento por um campo que a pessoa não vê nem pode corrigir.
 */
export function fichaOpcional(ler: (campo: CampoDaFicha) => string): DadosDaFicha {
  const v = validarFicha(ler);
  return v.ok ? v.dados : { ...FICHA_VAZIA };
}

/** Os campos como o formulário controla: texto, nunca nulo. */
export function fichaNoFormulario(f: Partial<Record<CampoDaFicha, string | null | undefined>>): Record<CampoDaFicha, string> {
  return Object.fromEntries(CAMPOS_DA_FICHA.map((c) => [c, f[c] ?? ""])) as Record<CampoDaFicha, string>;
}

/**
 * Completa o formulário com a Receita **só onde está vazio**: o que a pessoa já
 * digitou vale mais que o cadastro público, que costuma estar desatualizado em
 * telefone e endereço.
 */
export function completarComReceita(atual: Record<CampoDaFicha, string>, ficha: FichaDaReceita): Record<CampoDaFicha, string> {
  const novo = { ...atual };
  for (const [campo, valor] of Object.entries(fichaDaReceitaNosCampos(ficha)) as [CampoDaFicha, string][]) {
    if (novo[campo].trim() === "") novo[campo] = valor;
  }
  return novo;
}

/** A ficha da Receita nos campos do formulário — o que a busca pelo CNPJ preenche. */
export function fichaDaReceitaNosCampos(f: FichaDaReceita): Partial<Record<CampoDaFicha, string>> {
  const campos: Partial<Record<CampoDaFicha, string>> = {};
  const por = (campo: CampoDaFicha, v: string | null) => {
    if (v) campos[campo] = v;
  };
  por("tradeName", f.fantasia);
  por("phone", f.telefone);
  por("zipCode", f.cep);
  por("addressStreet", f.logradouro);
  por("addressNumber", f.numero);
  por("addressComplement", f.complemento);
  por("neighborhood", f.bairro);
  por("city", f.cidade);
  por("stateCode", f.uf);
  return campos;
}
