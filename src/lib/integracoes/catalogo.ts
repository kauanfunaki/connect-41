// O catálogo de integrações — o par do `MODULE_CATALOG`, do lado das conexões.
//
// Vive em código pelo mesmo motivo que o de módulos: **uma integração só existe
// quando o adaptador dela existe de verdade**. O que é dinâmico por cliente é o
// ligado/desligado e as credenciais, que moram em `TenantIntegration`.
//
// É este arquivo que faz um plugin novo ser configuração em vez de tabela: os
// campos que cada integração pede são declarados aqui, e um formulário só sabe
// desenhar qualquer um deles.

/** Um campo de credencial ou configuração que a integração pede. */
export type CampoDeIntegracao = {
  name: string;
  label: string;
  /**
   * `secret` nunca volta para a tela depois de salvo — o formulário mostra
   * "•••• (preenchido)" e só grava quando alguém digita algo novo. Sem esta
   * distinção, editar o rótulo de uma conexão devolveria a senha ao navegador.
   */
  type: "text" | "secret" | "url";
  required: boolean;
  help?: string;
};

export type NaturezaDaIntegracao =
  /** Varre e traz dado em laço, com cursor — o padrão do SPED. */
  | "SYNC"
  /** Opera um site no lugar de uma pessoa — os portais dos órgãos. */
  | "ROBO"
  /** Chamada pontual a uma API, sem estado entre execuções. */
  | "API";

export type IntegracaoDef = {
  code: string;
  label: string;
  /** O sistema do outro lado, como as pessoas o chamam. */
  vendor: string;
  natureza: NaturezaDaIntegracao;
  /** Setor a que pertence, ou `null` quando serve o app inteiro. */
  sectorCode: string | null;
  description: string;
  campos: CampoDeIntegracao[];
  /**
   * Integração **nunca** nasce ligada. Diferente de módulo, ligar aqui
   * significa começar a falar com sistema de terceiro usando credencial de
   * alguém — é ato deliberado, não padrão.
   */
  defaultEnabled: false;
};

/**
 * As integrações que o Connect sabe operar.
 *
 * ─── Por que a lista está quase vazia ────────────────────────────────────────
 *
 * Declarar aqui é prometer que existe adaptador. O Omie entra porque foi
 * confirmado como plugin piloto em 10/09, e os campos dele são os que a forma
 * precisa exercitar — chave de aplicação e segredo, que é o formato mais comum.
 *
 * As três integrações que já rodam no app (Chatwoot, SPED e o cofre do BPO)
 * **não estão aqui de propósito**: cada uma tem tabela própria e dado dentro, e
 * convergi-las é trabalho à parte. O que esta forma impede é a quarta, a quinta
 * e a sexta nascerem tortas.
 */
export const INTEGRATION_CATALOG: IntegracaoDef[] = [
  {
    code: "omie",
    label: "Omie",
    vendor: "Omie",
    natureza: "API",
    sectorCode: "bpo",
    description: "Plano de contas, fornecedores e títulos do ERP do cliente",
    defaultEnabled: false,
    campos: [
      {
        name: "appKey",
        label: "App Key",
        type: "text",
        required: true,
        help: "Gerada no painel do Omie, em Configurações › API",
      },
      {
        name: "appSecret",
        label: "App Secret",
        type: "secret",
        required: true,
      },
    ],
  },
  {
    code: "sima_curitiba",
    label: "SIMA — Meio Ambiente Curitiba",
    vendor: "Prefeitura de Curitiba",
    natureza: "ROBO",
    sectorCode: "societario",
    description:
      "Acompanha solicitações de licença ambiental e captura a DAM — o portal onde o alvará de Meio Ambiente tramita",
    defaultEnabled: false,
    campos: [
      {
        name: "loginIdentidade",
        label: "Login que abriu o pedido",
        type: "text",
        required: true,
        help:
          "O SIMA exige que a consulta seja feita no MESMO login que solicitou. Credencial de escritório não serve para pedido aberto por outro login.",
      },
      {
        name: "certificadoRef",
        label: "Certificado digital (referência)",
        type: "secret",
        required: true,
        help:
          "Referência ao A1 no cofre, nunca o arquivo aqui. Autorizado em 11/09/2026.",
      },
    ],
  },
];

export function integracaoDoCatalogo(code: string): IntegracaoDef | null {
  return INTEGRATION_CATALOG.find((i) => i.code === code) ?? null;
}

/**
 * Os campos obrigatórios que faltam numa configuração.
 *
 * Devolve nomes, não um booleano: a tela precisa dizer **qual** campo falta, e
 * "configuração inválida" sem o nome é o tipo de erro que faz a pessoa tentar
 * de novo igual.
 *
 * Campo em branco e campo ausente contam igual — string vazia não é credencial.
 */
export function camposFaltando(
  def: IntegracaoDef,
  config: Record<string, unknown>
): string[] {
  return def.campos
    .filter((c) => c.required)
    .filter((c) => {
      const valor = config[c.name];
      return typeof valor !== "string" || valor.trim() === "";
    })
    .map((c) => c.label);
}

/**
 * Mescla o que veio do formulário com o que já estava salvo.
 *
 * A regra existe por causa do `secret`: a tela nunca recebe o valor guardado, e
 * manda vazio quando ninguém digitou nada. Sem esta mescla, **editar o rótulo
 * de uma conexão apagaria a senha dela** — e o erro só apareceria na próxima
 * execução, como falha de autenticação sem causa aparente.
 */
export function mesclarConfig(
  def: IntegracaoDef,
  atual: Record<string, unknown>,
  recebido: Record<string, unknown>
): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const campo of def.campos) {
    const novo = recebido[campo.name];
    const veioAlgo = typeof novo === "string" && novo.trim() !== "";
    if (veioAlgo) {
      saida[campo.name] = (novo as string).trim();
      continue;
    }
    const antigo = atual[campo.name];
    if (typeof antigo === "string") saida[campo.name] = antigo;
  }
  return saida;
}

/** O que a tela pode mostrar de uma configuração sem vazar segredo. */
export function configParaTela(
  def: IntegracaoDef,
  config: Record<string, unknown>
): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const campo of def.campos) {
    const valor = config[campo.name];
    if (typeof valor !== "string" || valor === "") {
      saida[campo.name] = "";
      continue;
    }
    saida[campo.name] = campo.type === "secret" ? "" : valor;
  }
  return saida;
}

/** Um segredo já guardado existe? É o que a tela usa para dizer "preenchido". */
export function segredosPreenchidos(
  def: IntegracaoDef,
  config: Record<string, unknown>
): string[] {
  return def.campos
    .filter((c) => c.type === "secret")
    .filter((c) => typeof config[c.name] === "string" && (config[c.name] as string) !== "")
    .map((c) => c.name);
}
