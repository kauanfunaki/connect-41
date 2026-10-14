// O resumo de uma empresa em Colaboradores de clientes (14/10/2026, escolha
// "1C — Seletor de empresa no topo" do Kauan): os números da faixa em cima da
// tabela. Regra pura, sem banco — quem lê as pessoas é `consultas.ts`.
//
// Só o que o cadastro da pessoa já guarda: a situação do vínculo
// (`employmentStatus`) e as datas de admissão e de desligamento. Fica certo
// enquanto o DP mantiver esses campos em dia — as telas de admissão, férias,
// afastamento e desligamento já os mudam sozinhas.
//
// - **Situação** (Ativos, Em férias, Afastados, admissões em andamento): conta
//   só cadastro ativo. O cadastro inativo está arquivado e sai da lista
//   padrão; contá-lo como "ativo" seria contar quem a tela não mostra.
// - **Admissões no mês**: a data de admissão cai no mês, com cadastro ativo —
//   admissão com o cadastro inativado é admissão que não foi adiante.
// - **Desligamentos no mês**: a data de desligamento cai no mês, com cadastro
//   ativo ou não — arquivar quem saiu é o normal, e a saída aconteceu.

import type { PersonEmploymentStatus } from "@/generated/prisma/enums";
import { hojeIso, mesCurto } from "@/lib/datas/calendario";

export type PessoaDoResumo = {
  employmentStatus: PersonEmploymentStatus;
  active: boolean;
  admissionDate: Date | null;
  dismissalDate: Date | null;
};

export type ResumoDaEmpresa = {
  /** O mês contado, "AAAA-MM" — o de hoje em São Paulo. */
  mes: string;
  ativos: number;
  emFerias: number;
  afastados: number;
  /** Todas as admissões em andamento da empresa, tenham data ou não. */
  admissoesEmAndamento: number;
  admissoesNoMes: number;
  desligamentosNoMes: number;
};

/**
 * O dia ("AAAA-MM-DD") de uma data gravada no cadastro da pessoa.
 *
 * As datas vêm de dois jeitos: o formulário grava a data do calendário como
 * meia-noite UTC (`new Date("2026-10-31")`), e a finalização do desligamento
 * grava o instante em que alguém clicou (`dismissalDate: finalizedAt`). Ler
 * as duas em UTC jogaria o desligamento finalizado às 22h do dia 31 para o mês
 * seguinte; ler as duas em São Paulo jogaria a data do formulário para o dia
 * anterior. Meia-noite UTC em ponto é data de calendário; o resto é instante,
 * lido no fuso do escritório.
 */
export function diaDoRegistro(d: Date): string {
  const meiaNoiteUtc =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  return meiaNoiteUtc ? d.toISOString().slice(0, 10) : hojeIso(d);
}

/** O mês ("AAAA-MM") de hoje, em São Paulo. */
export function mesDeHoje(agora: Date): string {
  return hojeIso(agora).slice(0, 7);
}

function noMes(d: Date | null, mes: string): boolean {
  return d !== null && diaDoRegistro(d).slice(0, 7) === mes;
}

export function resumoDaEmpresa(pessoas: PessoaDoResumo[], agora: Date): ResumoDaEmpresa {
  const mes = mesDeHoje(agora);
  const r: ResumoDaEmpresa = {
    mes,
    ativos: 0,
    emFerias: 0,
    afastados: 0,
    admissoesEmAndamento: 0,
    admissoesNoMes: 0,
    desligamentosNoMes: 0,
  };
  for (const p of pessoas) {
    if (noMes(p.dismissalDate, mes)) r.desligamentosNoMes++;
    if (!p.active) continue;
    if (noMes(p.admissionDate, mes)) r.admissoesNoMes++;
    switch (p.employmentStatus) {
      case "ATIVO":
        r.ativos++;
        break;
      case "EM_FERIAS":
        r.emFerias++;
        break;
      case "AFASTADO":
        r.afastados++;
        break;
      case "ADMISSAO_EM_ANDAMENTO":
        r.admissoesEmAndamento++;
        break;
      case "DESLIGADO":
        break;
    }
  }
  return r;
}

/** Um número da faixa — o mesmo formato do `ItemDeTotal` da `FaixaDeTotais`. */
export type NumeroDoResumo = { rotulo: string; valor: string; detalhe?: string; tom?: string };

const INTEIRO = new Intl.NumberFormat("pt-BR");

/**
 * Os cinco números da faixa, na ordem do desenho aprovado: Ativos (o cartão
 * em destaque), Admissões no mês (com as em andamento embaixo), Desligamentos
 * no mês, Em férias e Afastados. O mês vai no rótulo ("Admissões em out"),
 * para ninguém ler o número como total.
 */
export function numerosDoResumo(r: ResumoDaEmpresa): NumeroDoResumo[] {
  const mes = mesCurto(Number(r.mes.slice(5, 7)));
  return [
    { rotulo: "Ativos", valor: INTEIRO.format(r.ativos) },
    {
      rotulo: `Admissões em ${mes}`,
      valor: INTEIRO.format(r.admissoesNoMes),
      tom: r.admissoesNoMes > 0 ? "text-success-fg" : undefined,
      detalhe: r.admissoesEmAndamento > 0 ? `${INTEIRO.format(r.admissoesEmAndamento)} em andamento` : undefined,
    },
    { rotulo: `Desligamentos em ${mes}`, valor: INTEIRO.format(r.desligamentosNoMes) },
    { rotulo: "Em férias", valor: INTEIRO.format(r.emFerias) },
    { rotulo: "Afastados", valor: INTEIRO.format(r.afastados) },
  ];
}
