// Leads do Comercial (05/10/2026) — o que não depende de banco: rótulos, os
// recortes da lista, a validação da ficha pública do portal e quem é avisado.
//
// Decisões do Kauan em 05/10: o lead mora no setor Comercial, chega hoje só
// pela ficha "Quero ser cliente" do portal (outras entradas virão, por isso a
// origem é texto livre), e converter o lead em empresa não entra agora.

import type { LeadStatus } from "@/generated/prisma/enums";
import { isValidCNPJ } from "@/lib/validation/common";

export const MODULO_LEADS = "comercial_leads";

// ─── Situação ───────────────────────────────────────────────────────────────

export const STATUS_DO_LEAD: readonly LeadStatus[] = ["NOVO", "EM_CONTATO", "CONVERTIDO", "DESCARTADO"];

/** "Virou cliente" em vez de "Convertido": é o que a equipe diz no dia a dia. */
export const ROTULO_DO_STATUS: Record<LeadStatus, string> = {
  NOVO: "Novo",
  EM_CONTATO: "Em contato",
  CONVERTIDO: "Virou cliente",
  DESCARTADO: "Descartado",
};

/**
 * O tom do `Selo` de cada situação. Era a variante do `Badge` (pílula de
 * categoria) — a situação de uma linha é o `Selo`, como em DP, Vagas e Testes
 * (auditoria DRG-05, 07/10/2026). "Novo" segue azul: o `info` virou `marca`.
 * "Descartado" saiu de cena e não pede ação: neutro, como as situações
 * encerradas do resto do app (escolha 2A, 08/10/2026).
 */
export const TOM_DO_STATUS: Record<LeadStatus, "marca" | "atencao" | "sucesso" | "neutro"> = {
  NOVO: "marca",
  EM_CONTATO: "atencao",
  CONVERTIDO: "sucesso",
  DESCARTADO: "neutro",
};

/** Observações da equipe sobre o lead — texto livre, mas não um documento. */
export const MAX_OBSERVACOES_DO_LEAD = 5000;

export function ehStatusDoLead(valor: unknown): valor is LeadStatus {
  return typeof valor === "string" && (STATUS_DO_LEAD as readonly string[]).includes(valor);
}

/**
 * Os recortes do filtro "Situação". Sem parâmetro na URL a lista mostra os em
 * aberto (novos e em contato) — é o que o Comercial ainda tem de fazer.
 */
export const RECORTES_DOS_LEADS = [
  { chave: "novos", rotulo: "Novos", status: ["NOVO"] },
  { chave: "em-contato", rotulo: "Em contato", status: ["EM_CONTATO"] },
  { chave: "viraram-cliente", rotulo: "Viraram cliente", status: ["CONVERTIDO"] },
  { chave: "descartados", rotulo: "Descartados", status: ["DESCARTADO"] },
  { chave: "todos", rotulo: "Todos", status: null },
] as const satisfies readonly { chave: string; rotulo: string; status: readonly LeadStatus[] | null }[];

export const STATUS_EM_ABERTO: readonly LeadStatus[] = ["NOVO", "EM_CONTATO"];

/** Os status do recorte pedido na URL; `null` é "todos". Valor desconhecido cai em "em aberto". */
export function statusDoRecorte(chave: string | null | undefined): readonly LeadStatus[] | null {
  const recorte = RECORTES_DOS_LEADS.find((r) => r.chave === chave);
  return recorte ? recorte.status : STATUS_EM_ABERTO;
}

// ─── Origem ─────────────────────────────────────────────────────────────────

/** A ficha "Quero ser cliente" do portal — a única entrada em 05/10/2026. */
export const ORIGEM_FICHA_DO_PORTAL = "PORTAL_FICHA";

const ROTULO_DA_ORIGEM: Record<string, string> = {
  [ORIGEM_FICHA_DO_PORTAL]: "Ficha do portal",
};

/** Origem que ainda não tem rótulo aparece como foi gravada, em vez de sumir. */
export function rotuloDaOrigem(origem: string): string {
  return ROTULO_DA_ORIGEM[origem] ?? origem;
}

// ─── A ficha pública ────────────────────────────────────────────────────────

export type CampoDaFicha = "nome" | "email" | "telefone" | "empresa" | "cnpj" | "mensagem" | "aceite";

export type FichaValida = {
  nome: string;
  email: string;
  /** Só dígitos, DDD + número (10 ou 11). */
  telefone: string;
  empresa: string;
  /** Só dígitos, ou `null` quando não veio. */
  cnpj: string | null;
  mensagem: string | null;
};

export type ResultadoDaFicha = { ok: true; ficha: FichaValida } | { ok: false; campo: CampoDaFicha; erro: string };

export const MAX_MENSAGEM_DA_FICHA = 2000;

/** Uma linha só: espaços repetidos e quebras viram um espaço. */
function linha(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

/**
 * O telefone em dígitos, ou `null` se não parece um telefone brasileiro.
 *
 * Aceita o que se digita de verdade — "(41) 99999-9999", "+55 41 99999-9999",
 * "041 99999 9999" — e guarda só DDD + número, para a tela e o link do
 * WhatsApp montarem o resto.
 */
export function normalizarTelefone(bruto: unknown): string | null {
  let d = typeof bruto === "string" ? bruto.replace(/\D/g, "") : "";
  d = d.replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  // DDD brasileiro vai de 11 a 99.
  if (d[0] === "0" || d[1] === "0") return null;
  return d;
}

/**
 * Confere a ficha "Quero ser cliente" e devolve os dados limpos — ou o
 * primeiro campo com problema e a mensagem para a pessoa.
 *
 * As mensagens dizem o que fazer, não o que deu errado por dentro: quem
 * preenche é alguém que ainda não é cliente e não tem a quem perguntar.
 */
export function validarFicha(e: {
  nome?: unknown;
  email?: unknown;
  telefone?: unknown;
  empresa?: unknown;
  cnpj?: unknown;
  mensagem?: unknown;
  aceite?: unknown;
}): ResultadoDaFicha {
  const nome = linha(e.nome);
  if (nome.length < 2) return { ok: false, campo: "nome", erro: "Informe o seu nome." };
  if (nome.length > 120) return { ok: false, campo: "nome", erro: "O nome passou de 120 caracteres." };

  const email = linha(e.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
    return { ok: false, campo: "email", erro: "Informe um e-mail válido, como nome@empresa.com.br." };
  }

  const telefone = normalizarTelefone(e.telefone);
  if (!telefone) {
    return { ok: false, campo: "telefone", erro: "Informe o telefone ou WhatsApp com DDD, como (41) 99999-9999." };
  }

  const empresa = linha(e.empresa);
  if (empresa.length < 2) return { ok: false, campo: "empresa", erro: "Informe o nome da empresa." };
  if (empresa.length > 160) return { ok: false, campo: "empresa", erro: "O nome da empresa passou de 160 caracteres." };

  const cnpjBruto = linha(e.cnpj);
  let cnpj: string | null = null;
  if (cnpjBruto) {
    const digitos = cnpjBruto.replace(/\D/g, "");
    if (digitos.length !== 14 || !isValidCNPJ(digitos)) {
      return { ok: false, campo: "cnpj", erro: "Este CNPJ não é válido. Confira os números — ou deixe em branco, ele é opcional." };
    }
    cnpj = digitos;
  }

  const mensagemBruta = typeof e.mensagem === "string" ? e.mensagem.trim() : "";
  if (mensagemBruta.length > MAX_MENSAGEM_DA_FICHA) {
    return { ok: false, campo: "mensagem", erro: "O texto passou de 2.000 caracteres. Resuma — a equipe completa com você no contato." };
  }

  const aceite = e.aceite === "1" || e.aceite === "on" || e.aceite === "true";
  if (!aceite) return { ok: false, campo: "aceite", erro: "Para enviar, marque que leu e aceita a política de privacidade." };

  return { ok: true, ficha: { nome, email, telefone, empresa, cnpj, mensagem: mensagemBruta || null } };
}

// ─── Quem recebe a ficha e quem é avisado ───────────────────────────────────

/**
 * O slug do escritório que recebe a ficha pública, lido da configuração.
 *
 * O portal é um endereço só para todos os clientes do Connect: o escritório de
 * quem já é cliente sai da própria conta (o login procura o e-mail em todos e,
 * desde 16/09, pede para escolher quando há mais de um). Quem ainda não é
 * cliente não tem conta — então o dono da ficha é o escritório dono do portal,
 * e isso é configuração, não palpite (decisão de 05/10/2026).
 */
export function slugDoEscritorioDaFicha(env: Record<string, string | undefined> = process.env): string | null {
  const slug = env.PORTAL_ESCRITORIO_SLUG?.trim().toLowerCase();
  return slug ? slug : null;
}

/**
 * Quem o sino avisa quando chega um lead: o pessoal do setor que opera o
 * módulo (o Comercial); se o setor não tem ninguém, os administradores — lead
 * sem ninguém avisado esfria sem que ninguém saiba que ele existe.
 */
export function quemAvisarDoLead(p: { doSetor: string[]; administradores: string[] }): string[] {
  const doSetor = [...new Set(p.doSetor)];
  return doSetor.length > 0 ? doSetor : [...new Set(p.administradores)];
}

/** O texto do sino — cabe nos 255 caracteres da notificação. */
export function textoDoAvisoDeLead(l: { nome: string; empresa: string | null; origem: string }): string {
  const quem = l.empresa ? `${l.nome}, ${l.empresa}` : l.nome;
  const texto = `Novo lead — ${quem} (${rotuloDaOrigem(l.origem).toLowerCase()}).`;
  return texto.length > 255 ? `${texto.slice(0, 254)}…` : texto;
}
