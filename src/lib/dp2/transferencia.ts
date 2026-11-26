// Transferência de colaborador entre empresas do grupo (26/11/2026,
// funcionalidade-771).
//
// O contrato passa para a outra empresa sem rescisão: a admissão, os
// períodos de férias, as médias, o histórico salarial e as ocorrências ficam
// com a pessoa; muda a empresa do cadastro e do contrato do DP 2. No eSocial a
// antiga envia o S-2299 com o motivo 11 (transferência para empresa do mesmo
// grupo, sem rescisão) e a nova o S-2200 com a sucessão do vínculo
// (sucessaoVinc). No mês da transferência, cada empresa calcula só os dias
// dela (periodoNaEmpresa).
//
// Puro, sem banco.

export type Transferencia = { personId: string; deCompanyId: string; paraCompanyId: string; data: string; motivo: string };

const raiz = (cnpj: string | null | undefined) => (cnpj ?? "").replace(/\D/g, "").slice(0, 8);

export function lerTransferencia(
  e: { personId: string; deCompanyId: string; paraCompanyId: string; data: string; motivo: string },
  p: { admissao: string | null; desligamento: string | null }
): { ok: true; transferencia: Transferencia } | { ok: false; erro: string } {
  if (!e.personId) return { ok: false, erro: "Escolha o colaborador." };
  if (!e.paraCompanyId) return { ok: false, erro: "Escolha a empresa de destino." };
  if (e.paraCompanyId === e.deCompanyId) return { ok: false, erro: "A empresa de destino é a mesma de hoje." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.data)) return { ok: false, erro: "Informe a data da transferência." };
  if (p.desligamento) return { ok: false, erro: "O colaborador está desligado: transfira só contrato ativo." };
  if (p.admissao && e.data <= p.admissao) return { ok: false, erro: "A transferência é depois da admissão." };
  return { ok: true, transferencia: { personId: e.personId, deCompanyId: e.deCompanyId, paraCompanyId: e.paraCompanyId, data: e.data, motivo: e.motivo.trim().slice(0, 200) || "Transferência entre empresas do grupo" } };
}

/** O que a tela avisa depois de transferir: os eventos do eSocial e a raiz do CNPJ. */
export function avisosDaTransferencia(de: { nome: string; cnpj: string | null }, para: { nome: string; cnpj: string | null }): string[] {
  const avisos = [
    `No eSocial: ${de.nome} envia o S-2299 com o motivo 11 (transferência para empresa do mesmo grupo, sem rescisão) e ${para.nome} envia o S-2200 com a sucessão do vínculo. Gere os dois na lista de transferências, abaixo.`,
    "No mês da transferência, cada empresa calcula só os dias dela: a origem até a véspera, o destino a partir do dia.",
    "Confira o contrato na empresa nova (convenção, horário, centro de custo e rubricas fixas): o salário e a admissão vieram iguais.",
  ];
  if (raiz(de.cnpj) && raiz(para.cnpj) && raiz(de.cnpj) !== raiz(para.cnpj)) {
    avisos.push("As empresas têm raízes de CNPJ diferentes: confirme que são do mesmo grupo econômico (CLT art. 2º, § 2º); se não forem, o caminho é rescisão e nova admissão.");
  }
  return avisos;
}

// ─── O período de cada empresa no mês (funcionalidade-771) ──────────────────

const iso = (d: Date) => d.toISOString().slice(0, 10);
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);
const vespera = (s: string) => iso(new Date(dia(s).getTime() - 86400000));

export type PassagemDeEmpresa = { data: string; deCompanyId: string; paraCompanyId: string };

/**
 * Os dias do mês em que a pessoa esteve na empresa, pelo histórico de
 * transferências: cada transferência fecha o trecho da origem na véspera e
 * abre o do destino no dia. Devolve a "admissão" e o "desligamento" do trecho
 * para o cálculo proporcional do mês (as datas reais de fora do trecho ficam
 * como estão), e se a pessoa entrou ou saiu da empresa no mês. Null quando a
 * pessoa não esteve na empresa em nenhum dia do mês.
 */
export function periodoNaEmpresa(
  passagens: readonly PassagemDeEmpresa[],
  p: { companyIdAtual: string; admissao: string | null; desligamento: string | null },
  companyId: string,
  ano: number,
  mes: number
): { admissao: string | null; desligamento: string | null; entrou: string | null; saiu: string | null } | null {
  const inicioDoMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimDoMes = iso(new Date(Date.UTC(ano, mes, 0)));
  const ordem = [...passagens].sort((a, b) => a.data.localeCompare(b.data));
  // Os trechos: [admissão, véspera da 1ª] na origem da 1ª, …, [última, desligamento] na atual.
  type Trecho = { companyId: string; de: string | null; ate: string | null; entrou: string | null; saiu: string | null };
  const trechos: Trecho[] = [];
  let de: string | null = p.admissao;
  let entrou: string | null = null;
  for (const t of ordem) {
    trechos.push({ companyId: t.deCompanyId, de, ate: vespera(t.data), entrou, saiu: t.data });
    de = t.data;
    entrou = t.data;
  }
  trechos.push({ companyId: ordem.length ? ordem[ordem.length - 1].paraCompanyId : p.companyIdAtual, de, ate: p.desligamento, entrou, saiu: null });
  const doMes = trechos.filter((t) => t.companyId === companyId && (!t.de || t.de <= fimDoMes) && (!t.ate || t.ate >= inicioDoMes));
  if (doMes.length === 0) return null;
  const primeiro = doMes[0];
  const ultimo = doMes[doMes.length - 1];
  const desligamentoReal = p.desligamento && (!ultimo.ate || p.desligamento <= ultimo.ate) ? p.desligamento : null;
  return {
    admissao: primeiro.de,
    desligamento: ultimo.ate && (!desligamentoReal || ultimo.ate < desligamentoReal) ? ultimo.ate : desligamentoReal ?? ultimo.ate,
    entrou: primeiro.entrou && primeiro.entrou >= inicioDoMes && primeiro.entrou <= fimDoMes ? primeiro.entrou : null,
    saiu: ultimo.saiu && ultimo.saiu > inicioDoMes && ultimo.saiu <= iso(new Date(dia(fimDoMes).getTime() + 86400000)) ? ultimo.saiu : null,
  };
}
