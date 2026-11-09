// O pedido pelo link público (09/11/2026) — a validação do formulário e o
// texto que vira a descrição da solicitação. Puro, sem banco.
//
// ─── O caso ──────────────────────────────────────────────────────────────────
//
// Quem ainda não é cliente (o primeiro caso é a abertura de empresa) recebe ou
// acha o link do escritório, preenche o formulário e o pedido chega ao setor
// do assunto como Solicitação — decisão do Kauan em 09/11. A empresa é uma
// prospecto com o nome que a pessoa der (ver `pedidoPublicoServidor.ts`).
//
// ─── O que fica de fora, de propósito ───────────────────────────────────────
//
// - **E-mail ao interessado.** Um endereço digitado num formulário público, sem
//   verificação, faria do Connect um relé de spam: qualquer um mandaria a
//   "confirmação" para o e-mail de outra pessoa. A equipe responde por
//   telefone ou e-mail, por fora — e a conversa da solicitação não chega a
//   quem não tem portal. Por isso a marca no começo da descrição.
// - **O CPF ou CNPJ na empresa.** Vai só na descrição: o CNPJ é único por
//   escritório, e o de um cliente digitado aqui penduraria o pedido de um
//   desconhecido no cadastro dele — que o cliente veria no portal. Pelo mesmo
//   motivo a empresa reusada é só prospecto (ver `prospectoDoPedido`).

import { z } from "zod";
import { normalizarTelefone } from "@/lib/leads/regras";
import { isValidCNPJ, isValidCPF } from "@/lib/validation/common";
import { formatCnpj, formatCpf, formatPhone } from "@/lib/format";
import { CAMPOS_DO_PEDIDO, LIMITES_DO_PEDIDO, MINIMO_DA_MENSAGEM, type CampoDoPedido } from "./linkPublico";

/** A `source` da empresa prospecto criada pelo formulário — a "Origem" no cadastro. */
export const ORIGEM_DO_PEDIDO_PUBLICO = "Link público de pedido";

/** O começo da descrição: a equipe vê de onde veio e que a conversa não chega à pessoa. */
export const MARCA_DO_PEDIDO_PUBLICO = "Pedido pelo link público";

export type DocumentoDoPedido = { tipo: "CPF" | "CNPJ"; digitos: string };

export type PedidoValido = {
  nome: string;
  /** Em minúsculas. */
  email: string;
  /** Só dígitos, DDD + número (10 ou 11). */
  telefone: string;
  empresa: string;
  documento: DocumentoDoPedido | null;
  mensagem: string;
};

export type ResultadoDaValidacao = { ok: true; pedido: PedidoValido } | { ok: false; campo: CampoDoPedido; erro: string };

/** Uma linha só: espaços repetidos e quebras viram um espaço. */
function umaLinha(valor: string): string {
  return valor.replace(/\s+/g, " ").trim();
}

/** O que veio do FormData: arquivo ou campo ausente viram texto vazio. */
const texto = z.preprocess((v) => (typeof v === "string" ? v : ""), z.string());

const L = LIMITES_DO_PEDIDO;

// As mensagens dizem o que fazer, não o que deu errado por dentro: quem
// preenche ainda não é cliente e não tem a quem perguntar (como a ficha
// "Quero ser cliente", `leads/regras.ts`).
const esquema = z.object({
  nome: texto
    .transform(umaLinha)
    .pipe(z.string().min(3, "Informe o seu nome completo.").max(L.nome, `O nome passou de ${L.nome} caracteres.`)),
  email: texto
    .transform((v) => umaLinha(v).toLowerCase())
    .pipe(z.email("Informe um e-mail válido, como nome@exemplo.com.br.").max(L.email, `O e-mail passou de ${L.email} caracteres.`)),
  telefone: texto
    .transform((v) => (v.length > L.telefone ? null : normalizarTelefone(v)))
    .pipe(z.string("Informe o telefone ou WhatsApp com DDD, como (41) 99999-9999.")),
  empresa: texto
    .transform(umaLinha)
    .pipe(
      z
        .string()
        .min(2, "Informe o nome da empresa. Se ela ainda vai ser aberta, o nome que você pretende dar.")
        .max(L.empresa, `O nome da empresa passou de ${L.empresa} caracteres.`)
    ),
  documento: texto.transform((v, ctx): DocumentoDoPedido | null => {
    const bruto = umaLinha(v);
    if (!bruto) return null;
    const digitos = bruto.replace(/\D/g, "");
    if (bruto.length <= L.documento) {
      if (digitos.length === 11 && isValidCPF(digitos)) return { tipo: "CPF", digitos };
      if (digitos.length === 14 && isValidCNPJ(digitos)) return { tipo: "CNPJ", digitos };
    }
    ctx.issues.push({
      code: "custom",
      input: v,
      message: "Este CPF ou CNPJ não é válido. Confira os números — ou deixe em branco, ele é opcional.",
    });
    return z.NEVER;
  }),
  mensagem: texto
    .transform((v) => v.trim())
    .pipe(
      z
        .string()
        .min(MINIMO_DA_MENSAGEM, "Conte em poucas palavras o que você precisa.")
        .max(L.mensagem, `A mensagem passou de ${Number(L.mensagem).toLocaleString("pt-BR")} caracteres. Resuma — a equipe completa com você no contato.`)
    ),
  aceite: z.preprocess(
    (v) => v === "1" || v === "on" || v === "true",
    z.literal(true, "Para enviar, autorize o uso dos dados para o escritório responder ao pedido.")
  ),
});

/**
 * Confere o formulário e devolve os dados limpos — ou o primeiro campo com
 * problema, na ordem da tela, e a mensagem para a pessoa.
 */
export function validarPedido(entrada: Partial<Record<CampoDoPedido, unknown>>): ResultadoDaValidacao {
  const r = esquema.safeParse(entrada);
  if (r.success) {
    // Sem o aceite: ele só precisa ter vindo marcado, e não segue adiante.
    const { nome, email, telefone, empresa, documento, mensagem } = r.data;
    return { ok: true, pedido: { nome, email, telefone, empresa, documento, mensagem } };
  }
  for (const campo of CAMPOS_DO_PEDIDO) {
    const problema = r.error.issues.find((i) => i.path[0] === campo);
    if (problema) return { ok: false, campo, erro: problema.message };
  }
  return { ok: false, campo: "mensagem", erro: "Confira os campos e envie de novo." };
}

/**
 * A descrição da solicitação: os dados do formulário legíveis para a equipe,
 * com a marca do link público no começo. Quebras de linha de propósito — a
 * tela da solicitação mostra o texto como foi escrito.
 */
export function descricaoDoPedido(p: PedidoValido): string {
  const documento = !p.documento
    ? "CPF ou CNPJ: não informado"
    : p.documento.tipo === "CPF"
      ? `CPF: ${formatCpf(p.documento.digitos)}`
      : `CNPJ: ${formatCnpj(p.documento.digitos)}`;
  return [
    `${MARCA_DO_PEDIDO_PUBLICO}. Quem pediu não tem acesso ao portal: a resposta por aqui não chega a essa pessoa — fale por telefone ou e-mail.`,
    "",
    `Nome: ${p.nome}`,
    `E-mail: ${p.email}`,
    `Telefone ou WhatsApp: ${formatPhone(p.telefone)}`,
    `Empresa: ${p.empresa}`,
    documento,
    "",
    "Mensagem:",
    p.mensagem,
  ].join("\n");
}
