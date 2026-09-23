// Motor do Valora — custeio por tempo (TDABC) e formação de preço por markup divisor.
// Sem Next, sem Prisma, sem React: este diretório é copiado tal e qual para o 41-gestao por
// scripts/valora/sincronizar-motor.mjs. Editar só aqui, no Connect.
//
//   minutos do setor = Σ atividades (tempo × fator de calibração × vezes/mês) × (1 + complexidade %)
//   custo do setor   = minutos × (custo/min da equipe + rateio/min das despesas fixas)
//   preço            = custo ÷ (1 − variáveis % − margem %)       ← markup divisor, nunca "custo + %"
//   tabela           = alvo ÷ (1 − desconto máximo %)             ← gordura para negociar

import type {
  Atividade,
  Catalogo,
  Frequencia,
  LinhaAtividade,
  ParametrosPreco,
  Perfil,
  Precos,
  Resultado,
  ResultadoSetor,
  Setor,
} from "./tipos";

const DIVISOR_FREQUENCIA: Record<Frequencia, number> = { mensal: 1, trimestral: 3, anual: 12, evento: 1 };

const finito = (n: number) => (Number.isFinite(n) ? n : 0);
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Preço que entrega `margemPct` depois de pagar `variaveisPct` sobre o próprio preço. null = impossível. */
export function markup(custo: number, variaveisPct: number, margemPct: number): number | null {
  const divisor = 1 - (variaveisPct + margemPct) / 100;
  return divisor > 0 ? custo / divisor : null;
}

/** Vezes por mês que a atividade acontece para este cliente (0 = não se aplica). */
export function vezesPorMes(a: Atividade, perfil: Perfil): number {
  if (a.condicao && !perfil.marcadores[a.condicao]) return 0;
  const q = a.quantidade;
  const base = q.tipo === "fixa" ? q.valor : finito(perfil.volumes[q.campo] ?? 0) * (q.fator ?? 1);
  return Math.max(0, finito(base)) / DIVISOR_FREQUENCIA[a.frequencia];
}

export function tempoNoRegime(a: Atividade, perfil: Perfil): number {
  return Math.max(0, finito(a.tempoMin[perfil.regime] ?? 0));
}

/** Rateio das despesas fixas por minuto produtivo, sobre a capacidade de todos os setores. */
export function rateioPorMinuto(catalogo: Catalogo, p: ParametrosPreco): number {
  const minutos = catalogo.setores.reduce((s, x) => s + finito(x.capacidadeHorasMes) * 60, 0);
  return minutos > 0 ? finito(p.despesasFixasMes) / minutos : 0;
}

export function custoPorMinuto(setor: Setor): number {
  const minutos = finito(setor.capacidadeHorasMes) * 60;
  return minutos > 0 ? finito(setor.custoMensal) / minutos : 0;
}

function precos(custo: number, p: ParametrosPreco): Precos {
  const alvo = markup(custo, p.variaveisPct, p.margemAlvoPct);
  const piso = markup(custo, p.variaveisPct, p.margemPisoPct);
  const tabela = alvo !== null && p.descontoMaximoPct < 100 ? alvo / (1 - p.descontoMaximoPct / 100) : null;
  const c = (n: number | null) => (n === null ? null : centavos(n));
  return { custo: centavos(custo), piso: c(piso), alvo: c(alvo), tabela: c(tabela) };
}

type Parcial = { linhas: LinhaAtividade[]; minutos: number };

function somar(atividades: Atividade[], setor: Setor, perfil: Perfil): Parcial {
  const linhas: LinhaAtividade[] = [];
  for (const a of atividades) {
    const vezes = vezesPorMes(a, perfil);
    const tempo = tempoNoRegime(a, perfil) * finito(setor.fatorCalibracao);
    if (vezes <= 0 || tempo <= 0) continue;
    linhas.push({ id: a.id, setor: a.setor, nome: a.nome, vezesMes: vezes, minutosExecucao: tempo, minutosMes: vezes * tempo });
  }
  return { linhas, minutos: linhas.reduce((s, l) => s + l.minutosMes, 0) };
}

/** Marcadores que se deduzem dos volumes, para o formulário não perguntar duas vezes. */
export function derivarMarcadores(perfil: Perfil): Perfil {
  const funcionarios = finito(perfil.volumes.funcionarios ?? 0);
  return { ...perfil, marcadores: { ...perfil.marcadores, temFolha: funcionarios > 0 } };
}

export function calcular(catalogo: Catalogo, perfilInformado: Perfil, p: ParametrosPreco): Resultado {
  const perfil = derivarMarcadores(perfilInformado);
  const avisos: string[] = [];
  const rateioMin = rateioPorMinuto(catalogo, p);
  const setores: ResultadoSetor[] = [];
  let custoImplantacao = 0;

  for (const setor of catalogo.setores) {
    if (!perfil.setores.includes(setor.codigo)) continue;
    const doSetor = catalogo.atividades.filter((a) => a.setor === setor.codigo);
    const recorrentes = doSetor.filter((a) => !a.implantacao && (!perfil.semMovimento || a.semMovimento));
    const mensal = somar(recorrentes, setor, perfil);
    if (perfil.semMovimento && setor.minutosSemMovimento) {
      const minutos = setor.minutosSemMovimento * finito(setor.fatorCalibracao);
      mensal.linhas.push({ id: `${setor.codigo}-SM`, setor: setor.codigo, nome: "Empresa sem movimento", vezesMes: 1, minutosExecucao: minutos, minutosMes: minutos });
      mensal.minutos += minutos;
    }

    const complexidadePct = catalogo.complexidades
      .filter((c) => c.setor === setor.codigo && perfil.complexidades.includes(c.id))
      .reduce((s, c) => s + Math.max(0, finito(c.pct)), 0);
    const minutosMes = mensal.minutos * (1 + complexidadePct / 100);
    const custoMin = custoPorMinuto(setor);
    const semCusto = custoMin <= 0;
    if (semCusto) avisos.push(`${setor.nome}: custo mensal da equipe não informado — só o rateio entra no custo.`);
    if (setor.fatorCalibracao !== 1)
      avisos.push(`${setor.nome}: tempos ajustados pela capacidade da equipe (fator ${setor.fatorCalibracao.toFixed(2).replace(".", ",")}).`);

    const implantacao = somar(doSetor.filter((a) => a.implantacao), setor, perfil);
    custoImplantacao += implantacao.minutos * (custoMin + rateioMin);

    setores.push({
      codigo: setor.codigo,
      nome: setor.nome,
      minutosMes,
      complexidadePct,
      custoDireto: minutosMes * custoMin,
      rateio: minutosMes * rateioMin,
      custo: minutosMes * (custoMin + rateioMin),
      semCusto,
      atividades: [...mensal.linhas, ...implantacao.linhas.map((l) => ({ ...l, nome: `${l.nome} (implantação)` }))],
    });
  }

  if (markup(1, p.variaveisPct, p.margemAlvoPct) === null)
    avisos.push("Variáveis + margem alvo chegam a 100% do preço: não existe preço que entregue essa margem.");

  const custoMensal = setores.reduce((s, x) => s + x.custo, 0);
  return {
    setores,
    mensal: precos(custoMensal, p),
    implantacao: precos(custoImplantacao, p),
    horasMes: setores.reduce((s, x) => s + x.minutosMes, 0) / 60,
    avisos,
  };
}
