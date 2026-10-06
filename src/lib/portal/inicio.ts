// O Início do portal (05/10): a primeira tela do cliente, no lugar da lista de
// documentos fiscais — pesada (252 mil documentos num cliente) e sem sentido
// como porta de entrada. Funções puras: as consultas ficam nos blocos
// (`components/portal/BlocosDoInicio.tsx`), e aqui mora o que se decide com
// os números na mão — o que entra em "O que precisa de você", em que ordem, e
// com que texto.
//
// O critério do que aparece é o do menu (`telasVisiveis`): o Início só fala de
// uma tela que o cliente tem.

import { addDaysToKey } from "@/lib/agenda";

// ─── O que precisa de você ───────────────────────────────────────────────────

/**
 * As contagens do topo. `null` = a tela não está no menu deste cliente, e o
 * item nem é considerado (diferente de zero, que é "tem a tela, nada esperando").
 */
export type ContagensDaAtencao = {
  aprovacoes: { n: number; centavos: number } | null;
  pendencias: number | null;
  solicitacoesAguardando: number | null;
  solicitacoesRespondidas: number | null;
  processosAguardando: number | null;
  comunicados: number | null;
};

/** `pedido`: o cliente precisa agir. `aviso`: há algo novo para ler. */
export type TomDaAtencao = "pedido" | "aviso";

export type ItemDaAtencao = {
  chave: "aprovacoes" | "pendencias" | "solicitacoesAguardando" | "processosAguardando" | "solicitacoesRespondidas" | "comunicados";
  quantidade: number;
  /** O que vem depois do número: "contas a pagar esperando a sua aprovação". */
  texto: string;
  detalhe?: string;
  href: string;
  /** O rótulo do botão. */
  acao: string;
  tom: TomDaAtencao;
};

function concorda(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

/**
 * A lista do topo do Início, só com o que tem número.
 *
 * Primeiro o que o cliente precisa **fazer** (aprovar, responder), depois o
 * que ele só precisa **ler**. Aprovação na frente: conta parada esperando o
 * "pode pagar" vira multa.
 */
export function oQuePrecisaDeVoce(
  c: ContagensDaAtencao,
  formatarValor: (centavos: number) => string
): ItemDaAtencao[] {
  const itens: ItemDaAtencao[] = [];

  if (c.aprovacoes && c.aprovacoes.n > 0) {
    const n = c.aprovacoes.n;
    itens.push({
      chave: "aprovacoes",
      quantidade: n,
      texto: concorda(n, "conta a pagar esperando a sua aprovação", "contas a pagar esperando a sua aprovação"),
      detalhe: `${formatarValor(c.aprovacoes.centavos)} no total`,
      href: "/portal/aprovacoes",
      acao: "Aprovar",
      tom: "pedido",
    });
  }
  if (c.pendencias && c.pendencias > 0) {
    itens.push({
      chave: "pendencias",
      quantidade: c.pendencias,
      texto: concorda(c.pendencias, "pedido da equipe esperando a sua resposta", "pedidos da equipe esperando a sua resposta"),
      href: "/portal/pendencias?recorte=aguardando",
      acao: "Responder",
      tom: "pedido",
    });
  }
  if (c.solicitacoesAguardando && c.solicitacoesAguardando > 0) {
    itens.push({
      chave: "solicitacoesAguardando",
      quantidade: c.solicitacoesAguardando,
      texto: concorda(
        c.solicitacoesAguardando,
        "solicitação em que a equipe precisa de você",
        "solicitações em que a equipe precisa de você"
      ),
      href: "/portal/solicitacoes?recorte=aguardando",
      acao: "Ver o que falta",
      tom: "pedido",
    });
  }
  if (c.processosAguardando && c.processosAguardando > 0) {
    itens.push({
      chave: "processosAguardando",
      quantidade: c.processosAguardando,
      texto: concorda(c.processosAguardando, "processo parado esperando algo seu", "processos parados esperando algo seu"),
      href: "/portal/processos?recorte=aguardando",
      acao: "Ver o que falta",
      tom: "pedido",
    });
  }
  if (c.solicitacoesRespondidas && c.solicitacoesRespondidas > 0) {
    itens.push({
      chave: "solicitacoesRespondidas",
      quantidade: c.solicitacoesRespondidas,
      texto: concorda(
        c.solicitacoesRespondidas,
        "solicitação com resposta nova da equipe",
        "solicitações com resposta nova da equipe"
      ),
      href: "/portal/solicitacoes",
      acao: "Ler a resposta",
      tom: "aviso",
    });
  }
  if (c.comunicados && c.comunicados > 0) {
    itens.push({
      chave: "comunicados",
      quantidade: c.comunicados,
      texto: concorda(c.comunicados, "comunicado novo", "comunicados novos"),
      href: "/portal/comunicados",
      acao: "Ler",
      tom: "aviso",
    });
  }
  return itens;
}

// ─── Saudação ────────────────────────────────────────────────────────────────

/** Pela hora de Brasília — quem chama passa `saoPauloParts(agora).hour`. */
export function saudacaoDaHora(hora: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function primeiroNome(nome: string | null | undefined): string {
  return nome?.trim().split(/\s+/)[0] ?? "";
}

// ─── Links antigos ───────────────────────────────────────────────────────────

/**
 * Os parâmetros da lista de documentos fiscais, que até 05/10 morava em
 * `/portal`. Link salvo ou favorito com algum deles era da lista, e não do
 * Início — e vai para a rota nova com tudo o que trazia.
 *
 * `empresa` sozinha **não** está aqui: é o filtro do próprio Início.
 */
export const PARAMETROS_DOS_DOCUMENTOS = ["competencia", "pagina", "busca"] as const;

export function destinoDosDocumentos(params: Record<string, string | string[] | undefined>): string | null {
  const ehDosDocumentos = PARAMETROS_DOS_DOCUMENTOS.some((p) => {
    const v = params[p];
    return Array.isArray(v) ? v.some(Boolean) : !!v;
  });
  if (!ehDosDocumentos) return null;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    for (const valor of Array.isArray(v) ? v : [v]) if (valor) query.append(k, valor);
  }
  return `/portal/documentos?${query.toString()}`;
}

// ─── Blocos ──────────────────────────────────────────────────────────────────

/** O que o Início mostra, a partir das telas do menu do cliente (`telasVisiveis`). */
export type BlocosDoInicio = {
  atencao: {
    aprovacoes: boolean;
    pendencias: boolean;
    solicitacoes: boolean;
    processos: boolean;
    comunicados: boolean;
  };
  financeiro: {
    pagar: boolean;
    /** Onde "a receber em atraso" leva: a cobrança, se o cliente tem; senão a lista do a receber. */
    receberEmAtraso: "/portal/cobranca" | "/portal/receber" | null;
    atalhos: { href: string; rotulo: string }[];
  } | null;
  societario: boolean;
  /** O caminho para pedir algo à equipe — solicitação nova ou, sem ela, a conversa. */
  pedir: { href: string; rotulo: string } | null;
};

/** Os atalhos do financeiro, na ordem do menu. */
const ATALHOS_DO_FINANCEIRO = [
  { href: "/portal/pagar", rotulo: "Contas a pagar" },
  { href: "/portal/receber", rotulo: "Contas a receber" },
  { href: "/portal/fluxo-de-caixa", rotulo: "Fluxo de caixa" },
  { href: "/portal/dre", rotulo: "DRE" },
] as const;

const TELAS_DO_FINANCEIRO = [
  "/portal/pagar",
  "/portal/receber",
  "/portal/cobranca",
  "/portal/fluxo-de-caixa",
  "/portal/relatorios",
  "/portal/dre",
];

export function blocosDoInicio(telas: ReadonlySet<string>): BlocosDoInicio {
  const temFinanceiro = TELAS_DO_FINANCEIRO.some((t) => telas.has(t));
  return {
    atencao: {
      aprovacoes: telas.has("/portal/aprovacoes"),
      pendencias: telas.has("/portal/pendencias"),
      solicitacoes: telas.has("/portal/solicitacoes"),
      processos: telas.has("/portal/processos"),
      comunicados: telas.has("/portal/comunicados"),
    },
    financeiro: temFinanceiro
      ? {
          pagar: telas.has("/portal/pagar"),
          receberEmAtraso: telas.has("/portal/cobranca") ? "/portal/cobranca" : telas.has("/portal/receber") ? "/portal/receber" : null,
          // Contas a receber só entra quando não há contas a pagar: três
          // botões cabem numa linha do celular, quatro não.
          atalhos: ATALHOS_DO_FINANCEIRO.filter(
            (a) => telas.has(a.href) && !(a.href === "/portal/receber" && telas.has("/portal/pagar"))
          ).map((a) => ({ ...a })),
        }
      : null,
    societario: telas.has("/portal/processos"),
    pedir: telas.has("/portal/solicitacoes")
      ? { href: "/portal/solicitacoes/nova", rotulo: "Pedir algo à equipe" }
      : telas.has("/portal/comunicacao")
        ? { href: "/portal/comunicacao", rotulo: "Mandar mensagem à equipe" }
        : null,
  };
}

/** Telas que aceitam `?empresa=` — o Início passa a empresa escolhida adiante. */
const ACEITAM_EMPRESA = new Set(["/portal/fluxo-de-caixa", "/portal/dre", "/portal/documentos"]);

export function comEmpresa(href: string, empresaId: string | null): string {
  return empresaId && ACEITAM_EMPRESA.has(href) ? `${href}?empresa=${encodeURIComponent(empresaId)}` : href;
}

// ─── Financeiro ──────────────────────────────────────────────────────────────

/**
 * A janela de "vence nos próximos dias": de hoje até hoje + `dias`, inclusive.
 * Vencida é antes de hoje — a mesma régua de `situacaoDaConta` (/pagar).
 */
export function janelaDosProximosDias(hojeKey: string, dias = 7): { inicioKey: string; fimKey: string; depoisKey: string } {
  return { inicioKey: hojeKey, fimKey: addDaysToKey(hojeKey, dias), depoisKey: addDaysToKey(hojeKey, dias + 1) };
}
