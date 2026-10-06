// A faixa de destaques da Home (06/10, opção C — a recomendada, escolhida
// pelo Kauan junto com A e B): os três números que mais importam para a
// pessoa, acima dos painéis. Função pura: recebe os números que os painéis já
// carregaram e devolve os cartões, em ordem.
//
// A regra:
// - Só entra número de painel que está na Home da pessoa — com acesso
//   (`acessoDosPaineis`) e não oculto em "Personalizar". O cartão nunca mostra
//   o que a tela de origem esconderia.
// - Um cartão por painel, no máximo: três cartões do mesmo painel repetiriam
//   o que ele já diz logo abaixo. Do painel sai o alerta, se houver; senão, o
//   volume em aberto. Volume zerado não vira cartão.
// - Alertas primeiro (dinheiro vencido, tarefas atrasadas, prazos estourados),
//   depois o volume; dentro de cada grupo, a ordem de ORDEM_DOS_PAINEIS.
// - Até três. Com menos candidatos, os que houver; sem nenhum, nada.

import { moeda } from "@/lib/financeiro/formato";
import type { HomeWidgetKey } from "@/lib/homeWidgets";
import type { MetricaDaHome } from "./metricas";
import type { FaixaDeVencimento, Soma } from "./paineis";

export const MAXIMO_DE_DESTAQUES = 3;

/** Os números de cada painel, como os painéis já os calculam. Ausente = painel fora da Home. */
export type NumerosDaHome = {
  tarefas?: { atrasadas: number; hoje: number; abertas: number };
  contas?: {
    verPagar: boolean;
    verReceber: boolean;
    pagar: Record<FaixaDeVencimento, Soma>;
    receber: Record<FaixaDeVencimento, Soma>;
  };
  semanas?: { estaSemana: Soma };
  pendencias?: {
    pendencias: { vencidas: number; respondidas: number; aguardando: number } | null;
    aprovacoes: { aguardando: Soma; reprovadas: Soma } | null;
  };
  processos?: { abertos: number; estourados: number; noLimite: number };
  dp?: { feriasVencidas: number; feriasAVencer: number };
  recrutamento?: { vagas: number; candidaturas: number };
  certificados?: { vencidos: number; aRenovar: number };
};

export type Destaque = {
  painel: HomeWidgetKey;
  metrica: MetricaDaHome;
  /** Pede ação (vencido, atrasado, estourado): o cartão fica vermelho. */
  alerta: boolean;
  /** O que o número é ("A pagar vencido") — vai depois do setor no rótulo. */
  titulo: string;
  /** Centavos ou contagem, conforme o formato da métrica. */
  valor: number;
  /** A linha de apoio ("30 contas a pagar"). */
  apoio: string;
  href: string;
};

/**
 * A ordem entre painéis, dentro dos alertas e dentro do volume: dinheiro,
 * tarefas da pessoa, prazos (processo, pendência com o cliente, férias),
 * validade dos certificados, vagas e, por último, a semana a pagar — que é
 * um recorte do mesmo dinheiro do painel de contas.
 */
export const ORDEM_DOS_PAINEIS: HomeWidgetKey[] = [
  "painel-contas",
  "painel-tarefas",
  "painel-processos",
  "painel-pendencias",
  "painel-dp",
  "painel-certificados",
  "painel-recrutamento",
  "painel-semanas",
];

const NUMERO = new Intl.NumberFormat("pt-BR");

function plural(n: number, um: string, varios: string): string {
  return `${NUMERO.format(n)} ${n === 1 ? um : varios}`;
}

function somaDaCarteira(f: Record<FaixaDeVencimento, Soma>): Soma {
  return {
    n: f.vencida.n + f.hoje.n + f.semana.n + f.depois.n,
    centavos: f.vencida.centavos + f.hoje.centavos + f.semana.centavos + f.depois.centavos,
  };
}

type Candidato = Omit<Destaque, "painel">;

/** O melhor candidato de cada painel: o alerta, se houver; senão o volume (se não for zero). */
function candidatoDoPainel(painel: HomeWidgetKey, n: NumerosDaHome): Candidato | null {
  switch (painel) {
    case "painel-contas": {
      const c = n.contas;
      if (!c) return null;
      if (c.verPagar && c.pagar.vencida.n > 0) {
        const v = c.pagar.vencida;
        return { metrica: "pagar_vencido", alerta: true, titulo: "A pagar vencido", valor: v.centavos, apoio: plural(v.n, "conta vencida", "contas vencidas"), href: "/pagar?recorte=vencidas" };
      }
      if (c.verReceber && c.receber.vencida.n > 0) {
        const v = c.receber.vencida;
        return { metrica: "receber_vencido", alerta: true, titulo: "A receber vencido", valor: v.centavos, apoio: plural(v.n, "conta vencida", "contas vencidas"), href: "/receber?recorte=vencidas" };
      }
      const pagar = somaDaCarteira(c.pagar);
      if (c.verPagar && pagar.n > 0) {
        return { metrica: "pagar_aberto", alerta: false, titulo: "Em aberto", valor: pagar.centavos, apoio: plural(pagar.n, "conta a pagar", "contas a pagar"), href: "/pagar" };
      }
      const receber = somaDaCarteira(c.receber);
      if (c.verReceber && receber.n > 0) {
        return { metrica: "receber_aberto", alerta: false, titulo: "Em aberto", valor: receber.centavos, apoio: plural(receber.n, "conta a receber", "contas a receber"), href: "/receber" };
      }
      return null;
    }

    case "painel-tarefas": {
      const t = n.tarefas;
      if (!t) return null;
      const apoio = `${plural(t.abertas, "aberta", "abertas")} nos seus kanbans`;
      if (t.atrasadas > 0) return { metrica: "tarefas_atrasadas", alerta: true, titulo: "Tarefas atrasadas", valor: t.atrasadas, apoio, href: "/tarefas" };
      if (t.hoje > 0) return { metrica: "tarefas_hoje", alerta: false, titulo: "Tarefas para hoje", valor: t.hoje, apoio, href: "/tarefas" };
      return null;
    }

    case "painel-processos": {
      const p = n.processos;
      if (!p) return null;
      if (p.estourados > 0) {
        return { metrica: "processos_estourados", alerta: true, titulo: "Prazo estourado", valor: p.estourados, apoio: `de ${plural(p.abertos, "processo", "processos")} em aberto`, href: "/processos" };
      }
      if (p.abertos > 0) {
        const apoio = p.noLimite > 0 ? `${NUMERO.format(p.noLimite)} no limite do prazo` : "nenhum com prazo estourado";
        return { metrica: "processos_abertos", alerta: false, titulo: "Processos em aberto", valor: p.abertos, apoio, href: "/processos" };
      }
      return null;
    }

    case "painel-pendencias": {
      const { pendencias: p, aprovacoes: a } = n.pendencias ?? { pendencias: null, aprovacoes: null };
      if (p && p.vencidas > 0) {
        const total = p.vencidas + p.respondidas + p.aguardando;
        return { metrica: "pendencias_vencidas", alerta: true, titulo: "Pendências vencidas", valor: p.vencidas, apoio: `de ${plural(total, "pendência", "pendências")} com o cliente`, href: "/pendencias?vencidas=1" };
      }
      if (a && a.aguardando.n > 0) {
        return { metrica: "aprovacoes_aguardando", alerta: false, titulo: "Aguardando aprovação", valor: a.aguardando.n, apoio: `${moeda(a.aguardando.centavos)} a pagar`, href: "/aprovacoes?situacao=aguardando" };
      }
      if (p && p.respondidas + p.aguardando > 0) {
        const apoio = p.respondidas > 0 ? plural(p.respondidas, "respondida, a revisar", "respondidas, a revisar") : "esperando o cliente";
        return { metrica: "pendencias_abertas", alerta: false, titulo: "Pendências com o cliente", valor: p.respondidas + p.aguardando, apoio, href: "/pendencias" };
      }
      return null;
    }

    case "painel-dp": {
      const d = n.dp;
      if (!d) return null;
      if (d.feriasVencidas > 0) {
        const apoio = d.feriasAVencer > 0 ? `${plural(d.feriasAVencer, "vence", "vencem")} em até 60 dias` : "período concessivo estourado";
        return { metrica: "ferias_vencidas", alerta: true, titulo: "Férias vencidas", valor: d.feriasVencidas, apoio, href: "/ferias" };
      }
      if (d.feriasAVencer > 0) {
        return { metrica: "ferias_a_vencer", alerta: false, titulo: "Férias a vencer", valor: d.feriasAVencer, apoio: "nos próximos 60 dias", href: "/ferias" };
      }
      return null;
    }

    case "painel-certificados": {
      const c = n.certificados;
      if (!c) return null;
      if (c.vencidos > 0) {
        const apoio = c.aRenovar > 0 ? `mais ${NUMERO.format(c.aRenovar)} a renovar em 60 dias` : "renovar o quanto antes";
        return { metrica: "certificados_vencidos", alerta: true, titulo: "Certificados vencidos", valor: c.vencidos, apoio, href: "/certificados" };
      }
      if (c.aRenovar > 0) {
        return { metrica: "certificados_a_renovar", alerta: false, titulo: "Certificados a renovar", valor: c.aRenovar, apoio: "vencem em até 60 dias", href: "/certificados" };
      }
      return null;
    }

    case "painel-recrutamento": {
      const r = n.recrutamento;
      if (!r || r.vagas === 0) return null;
      return { metrica: "vagas_abertas", alerta: false, titulo: "Vagas abertas", valor: r.vagas, apoio: plural(r.candidaturas, "candidatura", "candidaturas"), href: "/vagas" };
    }

    case "painel-semanas": {
      const s = n.semanas?.estaSemana;
      if (!s || s.n === 0) return null;
      return { metrica: "pagar_esta_semana", alerta: false, titulo: "A pagar esta semana", valor: s.centavos, apoio: `${plural(s.n, "conta", "contas")} até domingo`, href: "/pagar" };
    }

    default:
      return null;
  }
}

/**
 * Os cartões da faixa, em ordem. `visiveis` são os painéis que estão na Home
 * desta pessoa (acesso + "Personalizar"); número de painel fora dela é
 * ignorado mesmo que tenha vindo — a faixa não é um atalho para o que a
 * pessoa não vê.
 */
export function escolherDestaques(
  numeros: NumerosDaHome,
  visiveis: ReadonlySet<HomeWidgetKey>,
  maximo = MAXIMO_DE_DESTAQUES
): Destaque[] {
  const candidatos: Destaque[] = [];
  for (const painel of ORDEM_DOS_PAINEIS) {
    if (!visiveis.has(painel)) continue;
    const c = candidatoDoPainel(painel, numeros);
    if (c) candidatos.push({ painel, ...c });
  }
  // Ordenação estável: alertas antes do volume, e dentro de cada grupo a ordem
  // de ORDEM_DOS_PAINEIS, em que os candidatos já entraram.
  const ordenados = [...candidatos.filter((c) => c.alerta), ...candidatos.filter((c) => !c.alerta)];
  return ordenados.slice(0, Math.max(0, maximo));
}
