// Transferência de colaborador entre empresas do grupo (26/11/2026,
// funcionalidade-771, entrega 1).
//
// O contrato passa para a outra empresa sem rescisão: a admissão, os
// períodos de férias, as médias, o histórico salarial e as ocorrências ficam
// com a pessoa; muda a empresa do cadastro e do contrato do DP 2. No eSocial a
// antiga envia o S-2299 com o motivo 11 (transferência para empresa do mesmo
// grupo, sem rescisão) e a nova o S-2200 com a sucessão do vínculo
// (sucessaoVinc) — os eventos ficam para a entrega seguinte; aqui a tela diz
// o que fazer.
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
    `No eSocial: ${de.nome} envia o S-2299 com o motivo 11 (transferência para empresa do mesmo grupo, sem rescisão) e ${para.nome} envia o S-2200 com a sucessão do vínculo.`,
    "Confira o contrato na empresa nova (convenção, horário, centro de custo e rubricas fixas): o salário e a admissão vieram iguais.",
  ];
  if (raiz(de.cnpj) && raiz(para.cnpj) && raiz(de.cnpj) !== raiz(para.cnpj)) {
    avisos.push("As empresas têm raízes de CNPJ diferentes: confirme que são do mesmo grupo econômico (CLT art. 2º, § 2º); se não forem, o caminho é rescisão e nova admissão.");
  }
  return avisos;
}
