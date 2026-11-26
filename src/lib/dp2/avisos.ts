// Avisos de vencimento do DP 2 (25/11/2026, funcionalidade-757, entrega 1).
//
// O que o DP precisa olhar antes que vença, por colaborador com contrato:
// - férias: período em dobro (passou do concessivo com saldo) e concessivo
//   terminando nos próximos 60 dias;
// - contrato por prazo determinado (experiência 45 + 45 e outros) terminando
//   nos próximos 30 dias ou já vencido;
// - estágio com a previsão de término nos próximos 30 dias ou vencida;
// - dependentes: salário-família até 14 anos e dependente de IRRF filho ou
//   enteado até 21 (24 se universitário), quando a idade passa ou vai passar.
//
// Puro, sem banco.

import { periodosAquisitivos, type FeriasDoPeriodo } from "./periodosDeFerias";

export type TipoDeAviso = "FERIAS_EM_DOBRO" | "FERIAS_CONCESSIVO" | "CONTRATO_PRAZO" | "ESTAGIO" | "SALARIO_FAMILIA" | "DEPENDENTE_IRRF";

export const NOME_DO_AVISO: Record<TipoDeAviso, string> = {
  FERIAS_EM_DOBRO: "Férias em dobro",
  FERIAS_CONCESSIVO: "Férias a vencer",
  CONTRATO_PRAZO: "Fim do contrato",
  ESTAGIO: "Fim do estágio",
  SALARIO_FAMILIA: "Salário-família",
  DEPENDENTE_IRRF: "Dependente de IRRF",
};

export type Aviso = {
  personId: string;
  nome: string;
  companyId: string;
  tipo: TipoDeAviso;
  /** "AAAA-MM-DD": quando vence (ou venceu). */
  data: string;
  vencido: boolean;
  texto: string;
};

export type DependenteDoAviso = { nome: string; nascimento: string | null; relacao: string; irrf: boolean; salarioFamilia: boolean };

export type PessoaDoAviso = {
  personId: string;
  nome: string;
  companyId: string;
  admissao: string | null;
  desligamento: string | null;
  /** Dados do eSocial do contrato: tipo 2 = prazo determinado. */
  tipoContrato: string | null;
  dataTermino: string | null;
  estagioPrevisaoTermino: string | null;
  ferias: readonly FeriasDoPeriodo[];
  dependentes: readonly DependenteDoAviso[];
};

const DIA = 86_400_000;
const data = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const br = (s: string) => s.slice(0, 10).split("-").reverse().join("/");
const diasAte = (alvo: string, hoje: Date) => Math.round((data(alvo).getTime() - hoje.getTime()) / DIA);
const aniversario = (nascimento: string, anos: number) => {
  const n = data(nascimento);
  return iso(new Date(Date.UTC(n.getUTCFullYear() + anos, n.getUTCMonth(), n.getUTCDate())));
};

/**
 * Os avisos de vencimento das pessoas, do mais urgente (vencido há mais tempo)
 * ao mais distante. `hoje` sem hora ("AAAA-MM-DD").
 */
export function avisosDeVencimento(pessoas: readonly PessoaDoAviso[], hojeIso: string, janela = { contrato: 30, ferias: 60, dependente: 30 }): Aviso[] {
  const hoje = data(hojeIso);
  const avisos: Aviso[] = [];
  for (const p of pessoas) {
    if (p.desligamento && p.desligamento.slice(0, 10) <= hojeIso) continue;
    const base = { personId: p.personId, nome: p.nome, companyId: p.companyId };

    if (p.admissao) {
      for (const per of periodosAquisitivos(data(p.admissao), hoje, p.ferias)) {
        if (per.situacao === "EM_DOBRO") {
          avisos.push({ ...base, tipo: "FERIAS_EM_DOBRO", data: per.concessivoFim, vencido: true, texto: `Período ${br(per.inicio)} a ${br(per.fim)} passou do concessivo em ${br(per.concessivoFim)} com ${per.saldo} dia(s) de saldo: as férias saem em dobro.` });
        } else if (per.situacao === "A_GOZAR") {
          // O gozo tem de terminar até o fim do concessivo: o último dia para começar é concessivoFim − saldo + 1.
          const ultimoInicio = iso(new Date(data(per.concessivoFim).getTime() - (per.saldo - 1) * DIA));
          const faltam = diasAte(ultimoInicio, hoje);
          if (faltam <= janela.ferias) {
            avisos.push({
              ...base,
              tipo: "FERIAS_CONCESSIVO",
              data: ultimoInicio,
              vencido: faltam < 0,
              texto: `${per.saldo} dia(s) do período ${br(per.inicio)} a ${br(per.fim)}: para não pagar em dobro, o gozo começa até ${br(ultimoInicio)} (concessivo até ${br(per.concessivoFim)}).`,
            });
          }
        }
      }
    }

    if (p.tipoContrato === "2" && p.dataTermino) {
      const faltam = diasAte(p.dataTermino, hoje);
      if (faltam <= janela.contrato) {
        avisos.push({
          ...base,
          tipo: "CONTRATO_PRAZO",
          data: p.dataTermino,
          vencido: faltam < 0,
          texto:
            faltam < 0
              ? `O contrato por prazo determinado venceu em ${br(p.dataTermino)}: se a pessoa segue trabalhando, ele virou por prazo indeterminado (altere o contrato e envie o S-2206).`
              : `O contrato por prazo determinado (experiência) termina em ${br(p.dataTermino)}: prorrogue, efetive ou desligue.`,
        });
      }
    }

    if (p.estagioPrevisaoTermino) {
      const faltam = diasAte(p.estagioPrevisaoTermino, hoje);
      if (faltam <= janela.contrato) {
        avisos.push({ ...base, tipo: "ESTAGIO", data: p.estagioPrevisaoTermino, vencido: faltam < 0, texto: `O termo de estágio ${faltam < 0 ? "venceu" : "vence"} em ${br(p.estagioPrevisaoTermino)}: renove o termo ou encerre (S-2399).` });
      }
    }

    for (const d of p.dependentes) {
      if (!d.nascimento) continue;
      if (d.salarioFamilia) {
        const limite = aniversario(d.nascimento, 14);
        const faltam = diasAte(limite, hoje);
        if (faltam <= janela.dependente) {
          avisos.push({ ...base, tipo: "SALARIO_FAMILIA", data: limite, vencido: faltam < 0, texto: `${d.nome} ${faltam < 0 ? "fez" : "faz"} 14 anos em ${br(limite)}: o salário-família dele para no mês seguinte. Tire a marcação no cadastro do dependente.` });
        }
      }
      if (d.irrf && (d.relacao === "FILHO" || d.relacao === "ENTEADO")) {
        const aos21 = aniversario(d.nascimento, 21);
        const aos24 = aniversario(d.nascimento, 24);
        const faltam21 = diasAte(aos21, hoje);
        const faltam24 = diasAte(aos24, hoje);
        if (faltam24 <= janela.dependente) {
          avisos.push({ ...base, tipo: "DEPENDENTE_IRRF", data: aos24, vencido: faltam24 < 0, texto: `${d.nome} ${faltam24 < 0 ? "fez" : "faz"} 24 anos em ${br(aos24)}: deixa de ser dependente de IRRF mesmo se universitário.` });
        } else if (faltam21 <= janela.dependente && faltam21 >= -60) {
          // Depois dos 21, avisa por dois meses: o universitário segue até os 24, e o aviso não fica três anos na tela.
          avisos.push({ ...base, tipo: "DEPENDENTE_IRRF", data: aos21, vencido: faltam21 < 0, texto: `${d.nome} ${faltam21 < 0 ? "fez" : "faz"} 21 anos em ${br(aos21)}: só segue dependente de IRRF se cursar faculdade ou escola técnica (até 24).` });
        }
      }
    }
  }
  return avisos.sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, "pt-BR"));
}
