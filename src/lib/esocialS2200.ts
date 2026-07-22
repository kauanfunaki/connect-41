// Mapeamento CONFERÍVEL dos dados de admissão para os campos do evento eSocial
// S-2200 (Cadastramento Inicial do Vínculo e Admissão/Ingresso de Trabalhador).
//
// IMPORTANTE: isto é um RASCUNHO/pré-visualização para conferência do DP, NÃO a
// transmissão oficial. Não gera XML, não assina, não envia ao eSocial — a
// transmissão continua sendo feita pelo software de folha da empresa-cliente.
// O valor aqui é mostrar, a partir dos dados que a admissão digital já coletou,
// o que está preenchido e o que ainda falta antes do S-2200 poder ser gerado.
import { formatCalendarDate, maskCpf } from "@/lib/format";

export type S2200Field = {
  label: string;
  value: string | null; // null = pendente (dado ainda não coletado)
  ref: string; // caminho aproximado no leiaute do eSocial, ex: "trabalhador/cpfTrab"
  restricted?: boolean; // campo sensível não exibido por falta de permissão
};

export type S2200Group = { title: string; fields: S2200Field[] };

export type S2200Preview = {
  groups: S2200Group[];
  dependentes: { nome: string; tpDep: string; nascimento: string | null; cpf: string | null; irrf: boolean; sf: boolean }[];
  filledCount: number;
  pendingCount: number;
};

// Parentesco interno → código tpDep do eSocial (tabela 06). Aproximação para a
// conferência; o enquadramento fino (ex: filho até 21 vs universitário até 24)
// é decidido no software de folha na transmissão.
export function relationshipToTpDep(relationship: string): string {
  switch (relationship) {
    case "CONJUGE":
    case "COMPANHEIRO":
      return "01 — Cônjuge/companheiro(a)";
    case "FILHO":
    case "ENTEADO":
      return "03 — Filho(a)/enteado(a)";
    case "PAIS":
      return "09 — Pais/avós/bisavós";
    default:
      return "99 — Outros";
  }
}

export type S2200Input = {
  cpf: string | null;
  name: string;
  birthDate: Date | null;
  rg: string | null;
  pis: string | null;
  ctps: string | null;
  ctpsSerie: string | null;
  zipCode: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  stateCode: string | null;
  admissionDate: Date | null;
  cargoName: string | null;
  salary: string | null; // já convertido de Decimal
  workShift: string | null;
  weeklyWorkHours: string | null; // já convertido de Decimal
  includeSalary: boolean; // false = sem permissão de ver salário
  dependentes: {
    name: string;
    relationship: string;
    birthDate: Date | null;
    cpf: string | null;
    isIRDependent: boolean;
    isSalarioFamilia: boolean;
  }[];
};

function money(v: string | null): string | null {
  if (v == null) return null;
  return `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

export function buildS2200Preview(input: S2200Input): S2200Preview {
  const ctpsValue = [input.ctps, input.ctpsSerie].filter(Boolean).join(" / ") || null;

  const salaryField: S2200Field = input.includeSalary
    ? { label: "Remuneração", value: money(input.salary), ref: "infoContrato/remuneracao/vrSalFx" }
    : { label: "Remuneração", value: null, ref: "infoContrato/remuneracao/vrSalFx", restricted: true };

  const groups: S2200Group[] = [
    {
      title: "Identificação do trabalhador",
      fields: [
        { label: "CPF", value: input.cpf ? maskCpf(input.cpf) : null, ref: "trabalhador/cpfTrab" },
        { label: "Nome", value: input.name || null, ref: "trabalhador/nmTrab" },
      ],
    },
    {
      title: "Nascimento e documentos",
      fields: [
        { label: "Data de nascimento", value: input.birthDate ? formatCalendarDate(input.birthDate) : null, ref: "nascimento/dtNascto" },
        { label: "PIS/NIS", value: input.pis, ref: "trabalhador/nisTrab" },
        { label: "RG", value: input.rg, ref: "documentos/RG/nrRg" },
        { label: "CTPS (número/série)", value: ctpsValue, ref: "documentos/CTPS/nrCtps" },
      ],
    },
    {
      title: "Endereço (Brasil)",
      fields: [
        { label: "CEP", value: input.zipCode, ref: "endereco/brasil/cep" },
        { label: "Logradouro", value: input.addressStreet, ref: "endereco/brasil/dscLograd" },
        { label: "Número", value: input.addressNumber, ref: "endereco/brasil/nrLograd" },
        { label: "Complemento", value: input.addressComplement, ref: "endereco/brasil/complemento" },
        { label: "Bairro", value: input.neighborhood, ref: "endereco/brasil/bairro" },
        { label: "Município", value: input.city, ref: "endereco/brasil/nmMunic" },
        { label: "UF", value: input.stateCode, ref: "endereco/brasil/uf" },
      ],
    },
    {
      title: "Contrato de trabalho",
      fields: [
        { label: "Data de admissão", value: input.admissionDate ? formatCalendarDate(input.admissionDate) : null, ref: "infoContrato/dtAdm" },
        { label: "Cargo", value: input.cargoName, ref: "infoContrato/codCargo" },
        salaryField,
        { label: "Jornada", value: input.workShift, ref: "infoContrato/horContratual/dscTpJorn" },
        { label: "Carga horária semanal", value: input.weeklyWorkHours ? `${input.weeklyWorkHours}h` : null, ref: "infoContrato/horContratual/qtdHrsSem" },
      ],
    },
  ];

  // Conta preenchidos/pendentes ignorando campos restritos por permissão (não é
  // "pendência" de dado — só não é visível pra este usuário).
  let filledCount = 0;
  let pendingCount = 0;
  for (const g of groups) {
    for (const f of g.fields) {
      if (f.restricted) continue;
      if (f.value) filledCount++;
      else pendingCount++;
    }
  }

  const dependentes = input.dependentes.map((d) => ({
    nome: d.name,
    tpDep: relationshipToTpDep(d.relationship),
    nascimento: d.birthDate ? formatCalendarDate(d.birthDate) : null,
    cpf: d.cpf ? maskCpf(d.cpf) : null,
    irrf: d.isIRDependent,
    sf: d.isSalarioFamilia,
  }));

  return { groups, dependentes, filledCount, pendingCount };
}
