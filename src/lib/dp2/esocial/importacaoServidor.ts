// A prévia e a gravação da importação do eSocial no DP 2 (13/11/2026,
// funcionalidade-666). A leitura dos XML é `importacao.ts`; aqui entram o
// banco e as regras de quem já existe.
//
// Regras:
// - CPF é a chave: o mesmo CPF no escritório é a mesma pessoa.
// - Pessoa de outra empresa não muda de empresa sozinha: fica de fora, com o
//   motivo, para o DP decidir.
// - Para quem já existe, por padrão só se preenche o que está vazio; trocar o
//   que já tem valor é uma escolha ("atualizar o que já existe").
// - Desligado só entra se pedirem, e já entra inativo.
// - Repetir a importação não duplica: pessoa por CPF, um contrato por pessoa,
//   dependente por CPF ou nome.

import { PersonEmploymentStatus, PersonType } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { comNovaTentativa, proximoNumero } from "@/lib/enderecoCurtoNumeracao";
import { formatCpf, formatInstantDate } from "@/lib/format";
import { lerDadosEsocial } from "./cadastro";
import { cpfValido } from "./documentos";
import { contagemDeDependentes, type TrabalhadorImportado } from "./importacao";

export type SituacaoNaPrevia = "NOVA" | "EXISTE" | "OUTRA_EMPRESA" | "DESLIGADO" | "ERRO";

export type LinhaDaPrevia = {
  cpf: string;
  nome: string;
  situacao: SituacaoNaPrevia;
  /** Por que está assim (outra empresa, CPF inválido…). */
  motivo: string | null;
  admissao: string | null;
  desligamento: string | null;
  salario: number | null;
  tipoSalario: "MENSAL" | "HORISTA";
  cargo: string | null;
  dependentes: number;
  temContrato: boolean;
  avisos: string[];
};

const data = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : null);

async function pessoasPorCpf(tenantId: string, cpfs: string[]) {
  const formas = cpfs.flatMap((c) => [c, formatCpf(c)]);
  const pessoas = await getPrisma().person.findMany({
    where: { tenantId, cpf: { in: formas } },
    select: {
      id: true,
      name: true,
      cpf: true,
      currentCompanyId: true,
      isInternal: true,
      birthDate: true,
      admissionDate: true,
      dismissalDate: true,
      email: true,
      phone: true,
      zipCode: true,
      addressStreet: true,
      addressNumber: true,
      addressComplement: true,
      neighborhood: true,
      stateCode: true,
      currentSalary: true,
      monthlyWorkHours: true,
      weeklyWorkHours: true,
      cargoId: true,
      dp2Vinculo: true,
      dependentes: { select: { name: true, cpf: true } },
      currentCompany: { select: { name: true, displayName: true } },
    },
  });
  return new Map(pessoas.map((p) => [(p.cpf ?? "").replace(/\D/g, ""), p]));
}

export async function previaDaImportacao(tenantId: string, companyId: string, trabalhadores: TrabalhadorImportado[]): Promise<LinhaDaPrevia[]> {
  const existentes = await pessoasPorCpf(tenantId, trabalhadores.map((t) => t.cpf));
  return trabalhadores.map((t) => {
    const p = existentes.get(t.cpf);
    let situacao: SituacaoNaPrevia = p ? "EXISTE" : "NOVA";
    let motivo: string | null = null;
    if (!cpfValido(t.cpf)) {
      situacao = "ERRO";
      motivo = "CPF inválido.";
    } else if (p?.isInternal) {
      situacao = "OUTRA_EMPRESA";
      motivo = "É colaborador interno do escritório.";
    } else if (p?.currentCompanyId && p.currentCompanyId !== companyId) {
      situacao = "OUTRA_EMPRESA";
      motivo = `Está cadastrado em ${p.currentCompany?.displayName || p.currentCompany?.name || "outra empresa"}.`;
    } else if (t.desligamento) {
      situacao = "DESLIGADO";
      motivo = `Desligado em ${t.desligamento.split("-").reverse().join("/")}.`;
    }
    return {
      cpf: t.cpf,
      nome: t.nome,
      situacao,
      motivo,
      admissao: t.admissao,
      desligamento: t.desligamento,
      salario: t.salario,
      tipoSalario: t.tipoSalario,
      cargo: t.nomeDoCargo,
      dependentes: t.dependentes.length,
      temContrato: Boolean(p?.dp2Vinculo),
      avisos: [...t.avisos, "Conta bancária, insalubridade, periculosidade e vale-transporte não vêm do eSocial: confira no contrato."],
    };
  });
}

export type OpcoesDaImportacao = {
  incluirDesligados: boolean;
  atualizarExistentes: boolean;
  /** CPFs que o DP desmarcou na prévia. */
  ignorar: Set<string>;
};

export type ResultadoDaImportacao = { criadas: number; atualizadas: number; contratos: number; dependentes: number; fora: { nome: string; motivo: string }[] };

export async function gravarImportacao(
  tenantId: string,
  companyId: string,
  trabalhadores: TrabalhadorImportado[],
  opcoes: OpcoesDaImportacao
): Promise<ResultadoDaImportacao> {
  const prisma = getPrisma();
  const previa = new Map((await previaDaImportacao(tenantId, companyId, trabalhadores)).map((l) => [l.cpf, l]));
  const existentes = await pessoasPorCpf(tenantId, trabalhadores.map((t) => t.cpf));
  const r: ResultadoDaImportacao = { criadas: 0, atualizadas: 0, contratos: 0, dependentes: 0, fora: [] };

  for (const t of trabalhadores) {
    const linha = previa.get(t.cpf)!;
    if (opcoes.ignorar.has(t.cpf)) continue;
    if (linha.situacao === "ERRO" || linha.situacao === "OUTRA_EMPRESA") {
      r.fora.push({ nome: t.nome, motivo: linha.motivo ?? "" });
      continue;
    }
    if (linha.situacao === "DESLIGADO" && !opcoes.incluirDesligados) continue;

    const atual = existentes.get(t.cpf);
    const trocar = opcoes.atualizarExistentes || !atual;
    // Só o que veio do eSocial, e sem apagar o que já existe com vazio.
    const se = <T>(novo: T | null | undefined, velho: unknown): T | undefined => (novo === null || novo === undefined || novo === "" ? undefined : trocar || velho === null || velho === undefined || velho === "" ? novo : undefined);

    const desligado = Boolean(t.desligamento);
    const camposDaPessoa = {
      name: se(t.nome, atual?.name),
      birthDate: se(data(t.nascimento), atual?.birthDate),
      admissionDate: se(data(t.admissao), atual?.admissionDate),
      dismissalDate: se(data(t.desligamento), atual?.dismissalDate),
      email: se(t.email, atual?.email),
      phone: se(t.telefone, atual?.phone),
      zipCode: se(t.endereco.cep, atual?.zipCode),
      addressStreet: se(t.endereco.logradouro, atual?.addressStreet),
      addressNumber: se(t.endereco.numero, atual?.addressNumber),
      addressComplement: se(t.endereco.complemento, atual?.addressComplement),
      neighborhood: se(t.endereco.bairro, atual?.neighborhood),
      stateCode: se(t.endereco.uf, atual?.stateCode),
      currentSalary: se(t.salario, atual?.currentSalary),
      monthlyWorkHours: se(t.horasMensais, atual?.monthlyWorkHours),
      weeklyWorkHours: se(Math.round((t.horasMensais / 5) * 100) / 100, atual?.weeklyWorkHours),
    };

    // O número da pessoa nova sai dentro da mesma transação; perdendo a corrida
    // pelo número, a gravação inteira é refeita (até 3 vezes).
    const p = { criadas: 0, atualizadas: 0, contratos: 0, dependentes: 0 };
    await comNovaTentativa(() => prisma.$transaction(async (tx) => {
      Object.assign(p, { criadas: 0, atualizadas: 0, contratos: 0, dependentes: 0 });
      let cargoId: string | undefined;
      if (t.nomeDoCargo && (trocar || !atual?.cargoId)) {
        const nome = t.nomeDoCargo.slice(0, 120);
        const cargo =
          (await tx.cargo.findFirst({ where: { companyId, name: nome }, select: { id: true } })) ??
          (await tx.cargo.create({ data: { tenantId, companyId, name: nome }, select: { id: true } }));
        cargoId = cargo.id;
      }

      let personId: string;
      if (atual) {
        personId = atual.id;
        await tx.person.update({
          where: { id: atual.id },
          data: {
            ...camposDaPessoa,
            ...(cargoId ? { cargoId } : {}),
            ...(atual.currentCompanyId ? {} : { currentCompanyId: companyId }),
            ...(desligado && trocar ? { active: false, employmentStatus: PersonEmploymentStatus.DESLIGADO } : {}),
          },
        });
        p.atualizadas++;
      } else {
        const criada = await tx.person.create({
          data: {
            ...camposDaPessoa,
            tenantId,
            number: await proximoNumero(tx, "pessoa", tenantId),
            cpf: formatCpf(t.cpf),
            name: t.nome,
            type: PersonType.COLABORADOR,
            isInternal: false,
            currentCompanyId: companyId,
            active: !desligado,
            employmentStatus: desligado ? PersonEmploymentStatus.DESLIGADO : PersonEmploymentStatus.ATIVO,
            ...(cargoId ? { cargoId } : {}),
          },
          select: { id: true },
        });
        personId = criada.id;
        p.criadas++;
      }

      // Dependentes: entram os que faltam (por CPF, ou pelo nome sem CPF).
      const jaTem = atual?.dependentes ?? [];
      for (const d of t.dependentes) {
        const igual = jaTem.some((x) => (d.cpf && (x.cpf ?? "").replace(/\D/g, "") === d.cpf) || x.name.trim().toLowerCase() === d.nome.trim().toLowerCase());
        if (igual) continue;
        await tx.dependente.create({
          data: {
            tenantId,
            personId,
            name: d.nome,
            cpf: d.cpf ? formatCpf(d.cpf) : null,
            birthDate: data(d.nascimento),
            relationship: d.relacao,
            isIRDependent: d.irrf,
            isSalarioFamilia: d.salarioFamilia,
          },
        });
        p.dependentes++;
      }

      // O contrato do DP 2: sem salário no eSocial, não dá para criar.
      const v = atual?.dp2Vinculo;
      const contagem = contagemDeDependentes(t.dependentes);
      const dadosEsocial = v ? lerDadosEsocial(v.dadosEsocial) : null;
      const dadosNovos = lerDadosEsocial(
        Object.fromEntries(
          Object.entries(t.dados).map(([k, novo]) => {
            const velho = dadosEsocial?.[k as keyof typeof t.dados];
            return [k, novo !== null && (trocar || velho === null || velho === undefined) ? novo : velho ?? null];
          })
        )
      );
      if (!v && t.salario !== null && t.salario > 0) {
        await tx.dp2Vinculo.create({
          data: {
            tenantId,
            companyId,
            personId,
            salarioBase: t.salario,
            tipoSalario: t.tipoSalario,
            horasMensais: t.horasMensais,
            dependentesIrrf: contagem.irrf,
            filhosSalarioFamilia: contagem.salarioFamilia,
            matricula: t.matricula?.slice(0, 30) ?? null,
            categoria: t.categoria && /^\d{3}$/.test(t.categoria) ? t.categoria : "101",
            aprendiz: t.categoria === "103",
            dadosEsocial: dadosNovos,
            observacoes: `Importado do eSocial em ${formatInstantDate(new Date())}.`,
          },
        });
        p.contratos++;
      } else if (v) {
        await tx.dp2Vinculo.update({
          where: { id: v.id },
          data: {
            ...(trocar && t.salario !== null && t.salario > 0 ? { salarioBase: t.salario, tipoSalario: t.tipoSalario, horasMensais: t.horasMensais } : {}),
            ...(trocar ? { dependentesIrrf: contagem.irrf, filhosSalarioFamilia: contagem.salarioFamilia } : {}),
            ...(t.matricula && (trocar || !v.matricula) ? { matricula: t.matricula.slice(0, 30) } : {}),
            ...(t.categoria && /^\d{3}$/.test(t.categoria) && trocar ? { categoria: t.categoria, aprendiz: t.categoria === "103" } : {}),
            dadosEsocial: dadosNovos,
          },
        });
      }
    }));
    r.criadas += p.criadas;
    r.atualizadas += p.atualizadas;
    r.contratos += p.contratos;
    r.dependentes += p.dependentes;
  }
  return r;
}
