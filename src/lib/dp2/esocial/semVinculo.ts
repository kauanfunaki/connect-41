// O trabalhador sem vínculo de emprego no eSocial do DP 2 (12/11/2026, fase
// 3d): início (S-2300) e término (S-2399) do sócio com pró-labore (723), do
// autônomo por RPA (701) e do estagiário (901).
//
// - Estagiário: o S-2300 é obrigatório e leva os dados do estágio.
// - Sócio e autônomo: o S-2300 é opcional. Com matrícula no contrato, o
//   Connect entende que o S-2300 foi enviado e o S-1200 usa a matrícula; sem
//   matrícula, o S-1200 sai com nome e nascimento (eventos.ts).
//
// Como nas fases anteriores: o XML sem assinatura e as pendências, com o lugar
// de corrigir. ⚠️ Montados pelo leiaute S-1.3, sem a validação contra os XSD.
//
// Puro, sem banco.

import { el, decimal } from "./xml";
import { cnpjValido, cpfValido, digitos } from "./documentos";
import { envelope, ideEmpregador, pendenciasDoEmpregador, type EmpregadorEsocial, type EventoGerado, type GeradorDeId, type Pendencia } from "./eventos";
import { blocoDoTrabalhador, falta, ideEventoNaoPeriodico, linkDoCadastro, linkDoContrato, pendenciasPessoais, type TrabalhadorCompleto } from "./naoPeriodicos";
import { semVinculo } from "../categorias";

const data = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// ─── S-2300 Início ──────────────────────────────────────────────────────────

export function eventoS2300(e: EmpregadorEsocial, t: TrabalhadorCompleto, novoId: GeradorDeId): EventoGerado {
  const contrato = linkDoContrato(t.personId);
  const estagiario = t.categoria === "901";
  const d = t.dados;
  const pendencias: Pendencia[] = [...pendenciasDoEmpregador(e), ...pendenciasPessoais(t)];
  if (!cpfValido(t.cpf)) pendencias.push(falta("colaborador", `${t.nome}: CPF inválido ou ausente.`, linkDoCadastro(t.personId)));
  if (!semVinculo(t.categoria)) pendencias.push(falta("colaborador", `${t.nome}: o S-2300 é de sócio, autônomo ou estagiário; empregado vai no S-2200.`, contrato));
  if (!t.matricula) pendencias.push(falta("colaborador", `${t.nome}: informe a matrícula no contrato (o S-1200 usa a mesma).`, contrato));
  if (!t.admissao) pendencias.push(falta("colaborador", `${t.nome}: sem data de início no cadastro (admissão).`, linkDoCadastro(t.personId)));
  if (estagiario) {
    if (!d.estagioNatureza || !d.estagioNivel) pendencias.push(falta("colaborador", `${t.nome}: informe a natureza e o nível do estágio no contrato.`, contrato));
    if (!d.estagioPrevisaoTermino) pendencias.push(falta("colaborador", `${t.nome}: informe a previsão de término do estágio no contrato.`, contrato));
    if (!cnpjValido(d.estagioCnpjInstituicao)) pendencias.push(falta("colaborador", `${t.nome}: informe o CNPJ da instituição de ensino no contrato.`, contrato));
    if (d.estagioCnpjAgente && !cnpjValido(d.estagioCnpjAgente)) pendencias.push(falta("colaborador", `${t.nome}: CNPJ do agente de integração inválido.`, contrato));
    if (d.estagioCpfSupervisor && !cpfValido(d.estagioCpfSupervisor)) pendencias.push(falta("colaborador", `${t.nome}: CPF do supervisor do estágio inválido.`, contrato));
  }

  // Remuneração do contrato: no RPA sem valor fixo, "não aplicável" com a descrição.
  const comValorFixo = t.salario > 0;
  const remuneracao = el("remuneracao", [
    el("vrSalFx", decimal(comValorFixo ? t.salario : 0)),
    el("undSalFixo", comValorFixo ? "5" : "7"),
    el("dscSalVar", comValorFixo ? null : "Valor por servico prestado (RPA)"),
  ]);

  const id = novoId();
  const xml = envelope("S-2300", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    blocoDoTrabalhador(t),
    el("infoTSVInicio", [
      el("cadIni", "N"),
      el("matricula", t.matricula),
      el("codCateg", t.categoria),
      el("dtInicio", t.admissao),
      el("natAtividade", "1"),
      el("infoComplementares", [
        !estagiario && t.nomeDoCargo && d.cbo ? el("cargoFuncao", [el("nmCargo", t.nomeDoCargo.slice(0, 100)), el("CBOCargo", d.cbo)]) : null,
        remuneracao,
        estagiario
          ? el("infoEstagiario", [
              el("natEstagio", d.estagioNatureza),
              el("nivEstagio", d.estagioNivel),
              el("areaAtuacao", d.estagioArea),
              el("nrApol", d.estagioApolice),
              el("dtPrevTerm", d.estagioPrevisaoTermino),
              el("instEnsino", [el("cnpjInstEnsino", d.estagioCnpjInstituicao)]),
              d.estagioCnpjAgente ? el("ageIntegracao", [el("cnpjAgntInteg", d.estagioCnpjAgente)]) : null,
              el("cpfSupervisor", d.estagioCpfSupervisor),
            ])
          : null,
      ]),
    ]),
  ]);
  return { tipo: "S-2300", referencia: `${digitos(t.cpf) || t.nome} · ${t.categoria}`, personId: t.personId, idEvento: id, xml, pendencias };
}

// ─── S-2399 Término ─────────────────────────────────────────────────────────

export function eventoS2399(
  e: EmpregadorEsocial,
  t: { personId: string; nome: string; cpf: string | null; matricula: string | null; categoria: string },
  termino: string | null,
  novoId: GeradorDeId
): EventoGerado {
  const pendencias: Pendencia[] = [...pendenciasDoEmpregador(e)];
  if (!cpfValido(t.cpf)) pendencias.push(falta("colaborador", `${t.nome}: CPF inválido ou ausente.`, linkDoCadastro(t.personId)));
  if (!semVinculo(t.categoria)) pendencias.push(falta("colaborador", `${t.nome}: o S-2399 é de sócio, autônomo ou estagiário; empregado vai no S-2299.`, linkDoContrato(t.personId)));
  if (!data(termino)) pendencias.push(falta("colaborador", "Informe a data do término.", null));
  const id = novoId();
  const xml = envelope("S-2399", id, [
    ideEventoNaoPeriodico(),
    ideEmpregador(e.cnpj),
    // Com matrícula (houve S-2300), ela identifica; sem, a categoria.
    el("ideTrabSemVinculo", [el("cpfTrab", digitos(t.cpf)), el("matricula", t.matricula), t.matricula ? null : el("codCateg", t.categoria)]),
    el("infoTSVTermino", [el("dtTerm", data(termino))]),
  ]);
  return { tipo: "S-2399", referencia: `${digitos(t.cpf) || t.nome} · ${termino ?? "sem data"}`, personId: t.personId, idEvento: id, xml, pendencias };
}
