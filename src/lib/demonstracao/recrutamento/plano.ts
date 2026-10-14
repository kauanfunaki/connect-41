// Dados fictícios do Recrutamento no escritório da 41 (tenant `41tech`) —
// decisão do Kauan em 14/10/2026: ver e testar as telas novas do Recrutamento
// (ficha da vaga, quadro com números, ficha do candidato, Colaboradores de
// clientes, página do teste) com informação, e as vagas também no 41 Carreiras.
// Saem na limpeza de 15/10 (`scripts/dados-de-demonstracao.ts --limpar`).
//
// Aqui só se MONTA o que vai para o banco — sem banco, sem relógio próprio:
// recebe "agora" e devolve sempre a mesma coisa para o mesmo dia. Quem grava é
// `gravar.ts`; quem apaga, `limpeza.ts`.
//
// O que identifica cada coisa na limpeza (e garante que nada de verdade sai):
// - empresas: razão social com o prefixo "[demo]" **e** origem (`source`)
//   FONTE_DA_DEMO;
// - vagas, candidaturas, notas, avaliações e cargos: pendurados nas empresas;
// - pessoas (candidatos e colaboradores): e-mail @exemplo.invalido **e** a
//   etiqueta ETIQUETA_MARCADORA — as duas coisas juntas;
// - etiquetas e o modelo de questionário: nome com o prefixo "[demo]".
//
// Sem currículo em arquivo (a ficha mostra "sem currículo"), sem reunião (a
// agenda avisaria a equipe), sem link de admissão (o DP receberia alerta) e
// sem chamada de IA: toda candidatura em andamento já nasce com nota, e o cron
// da triagem só pega candidatura sem nenhuma.

import { calcularNota, type AvaliacaoDeRequisito, type Faixa, type Requisito, type Veredito } from "@/lib/recrutamento/triagem";
import { scoreDisc, type DiscAnswer, type DiscDimension, type DiscScores } from "@/lib/disc";
import { DISC_BANK, TOTAL_BLOCKS } from "@/lib/discBank";
import { hojeIso, somarDias } from "@/lib/datas/calendario";
import { cnpjFicticio, cpfFicticio, emailFicticio, telefoneFicticio } from "./documentos";

export const MARCA = "[demo]";
/** `Company.source` das empresas desta demonstração — a segunda trava, além do prefixo. */
export const FONTE_DA_DEMO = "demonstracao-recrutamento-41";
export const SETOR = "recrutamento";
export const SLUG_DO_TENANT = "41tech";
/** A etiqueta que toda pessoa fictícia leva. Sem ela (e sem o e-mail fictício), a limpeza não toca na pessoa. */
export const ETIQUETA_MARCADORA = `${MARCA} Dados fictícios`;

// ─── Tipos ──────────────────────────────────────────────────────────────────

type Uf = "PR";
export type ChaveDaEmpresa = "padaria" | "mercado" | "construtora" | "clinica";
export type Estagio = "TRIAGEM" | "ENTREVISTA" | "TESTE" | "PROPOSTA" | "CONTRATADO";
export type Desfecho = "EM_ANDAMENTO" | "REPROVADO" | "DESISTENTE" | "CONTRATADO" | "ENCERRADO";
export type SituacaoDoVinculo = "ATIVO" | "DESLIGADO" | "AFASTADO" | "EM_FERIAS" | "ADMISSAO_EM_ANDAMENTO";
export type Qualidade = "alta" | "media" | "baixa";

export type EmpresaDaDemo = {
  chave: ChaveDaEmpresa;
  name: string;
  displayName: string;
  tradeName: string;
  cnpj: string;
  cnaePrincipal: string;
  taxRegime: string;
  zipCode: string;
  addressStreet: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  stateCode: Uf;
};

export type CargoDaDemo = { chave: string; empresa: ChaveDaEmpresa; name: string; area: string };

export type EtiquetaDaDemo = { name: string; color: string };

export type PessoaDaDemo = {
  chave: string;
  type: "CANDIDATO" | "COLABORADOR";
  name: string;
  cpf: string;
  email: string;
  phone: string;
  birthDate: Date;
  education: string;
  zipCode: string;
  addressStreet: string;
  addressNumber: string;
  neighborhood: string;
  city: string;
  stateCode: Uf;
  notes: string | null;
  etiquetas: string[];
  createdAt: Date;
  // Só colaborador de cliente:
  empresa: ChaveDaEmpresa | null;
  cargo: string | null;
  employmentStatus: SituacaoDoVinculo;
  active: boolean;
  admissionDate: Date | null;
  dismissalDate: Date | null;
  currentSalary: number | null;
};

export type VersaoDosRequisitos = {
  versao: number;
  itens: Requisito[];
  corteCompativel: number;
  corteParcial: number;
  createdAt: Date;
};

export type VagaDaDemo = {
  chave: string;
  empresa: ChaveDaEmpresa;
  cargo: string;
  title: string;
  quantity: number;
  priority: "BAIXA" | "MEDIA" | "ALTA";
  status: "ABERTA" | "ENCERRADA";
  isPublic: boolean;
  publicDescription: string;
  notes: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  showSalary: boolean;
  workMode: "PRESENCIAL" | "HIBRIDO" | "REMOTO";
  contractType: "CLT" | "PJ" | "ESTAGIO" | "TEMPORARIO" | "APRENDIZ";
  benefits: string;
  workCity: string;
  workStateCode: Uf;
  openedAt: Date;
  closedAt: Date | null;
  applicationDeadline: Date;
  requisitos: VersaoDosRequisitos[];
};

export type NotaDaDemo = {
  versao: number;
  score: number;
  faixa: Faixa;
  avaliacoes: AvaliacaoDeRequisito[];
  resumo: string;
  origem: "AUTO" | "LOTE";
  createdAt: Date;
};

export type OrigemDaResposta = "PORTAL" | "WHATSAPP" | "RECRUTADOR";

export type CandidaturaDaDemo = {
  chave: string;
  vaga: string;
  pessoa: string;
  origin: string;
  stage: Estagio;
  status: Desfecho;
  rejectionReason: string | null;
  withdrawalReason: string | null;
  hiredAt: Date | null;
  createdAt: Date;
  pretensaoSalarial: number | null;
  disponibilidade: string | null;
  deslocamentoMinutos: number | null;
  respostasFonte: Record<string, { origem: OrigemDaResposta; em: string }> | null;
  notas: NotaDaDemo[];
};

export type EntrevistaDaDemo = {
  candidatura: string;
  /** "principal" = o administrador escolhido; "segundo" = outro administrador, se houver. */
  avaliador: "principal" | "segundo";
  stage: Estagio;
  comunicacao: number;
  tecnico: number;
  fitCultural: number;
  experiencia: number;
  recommendation: "AVANCAR" | "TALVEZ" | "REPROVAR";
  notes: string;
  createdAt: Date;
};

export type PerguntaDaDemo = { text: string; options: string[]; correctIndex: number };

export type QuestionarioDaDemo = { name: string; description: string; perguntas: PerguntaDaDemo[] };

export type TesteDaDemo = {
  chave: string;
  pessoa: string;
  candidatura: string;
  type: "DISC" | "MULTIPLA_ESCOLHA";
  status: "PENDENTE" | "RESPONDIDO";
  createdAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  /** DISC respondido: as 24 escolhas e a pontuação que o próprio Connect calcularia. */
  disc: { answers: DiscAnswer[]; scores: DiscScores; primaryProfile: DiscDimension; secondaryProfile: DiscDimension | null } | null;
  /** Questionário respondido: a alternativa escolhida em cada pergunta, na ordem do modelo. */
  escolhas: number[] | null;
};

export type PlanoDaDemonstracao = {
  hoje: string;
  empresas: EmpresaDaDemo[];
  cargos: CargoDaDemo[];
  etiquetas: EtiquetaDaDemo[];
  pessoas: PessoaDaDemo[];
  vagas: VagaDaDemo[];
  candidaturas: CandidaturaDaDemo[];
  entrevistas: EntrevistaDaDemo[];
  questionario: QuestionarioDaDemo;
  testes: TesteDaDemo[];
};

// ─── Empresas ───────────────────────────────────────────────────────────────

const REGIME = "Simples Nacional - Comércio ou Serviço - Com Pró-labore - Com Funcionários";

export const EMPRESAS: readonly EmpresaDaDemo[] = [
  {
    chave: "padaria",
    name: `${MARCA} PADARIA PÃO DOURADO LTDA`,
    displayName: `${MARCA} Padaria Pão Dourado`,
    tradeName: "Padaria Pão Dourado",
    cnpj: cnpjFicticio(1),
    cnaePrincipal: "1091-1/02",
    taxRegime: REGIME,
    zipCode: "80520-000",
    addressStreet: "R JOÃO GUALBERTO",
    addressNumber: "1500",
    neighborhood: "ALTO DA GLÓRIA",
    city: "Curitiba",
    stateCode: "PR",
  },
  {
    chave: "mercado",
    name: `${MARCA} MERCADO BOM PREÇO LTDA`,
    displayName: `${MARCA} Mercado Bom Preço`,
    tradeName: "Mercado Bom Preço",
    cnpj: cnpjFicticio(2),
    cnaePrincipal: "4711-3/02",
    taxRegime: REGIME,
    zipCode: "83005-000",
    addressStreet: "R XV DE NOVEMBRO",
    addressNumber: "2100",
    neighborhood: "CENTRO",
    city: "São José dos Pinhais",
    stateCode: "PR",
  },
  {
    chave: "construtora",
    name: `${MARCA} CONSTRUTORA HORIZONTE SUL LTDA`,
    displayName: `${MARCA} Construtora Horizonte Sul`,
    tradeName: "Construtora Horizonte Sul",
    cnpj: cnpjFicticio(3),
    cnaePrincipal: "4120-4/00",
    taxRegime: REGIME,
    zipCode: "81070-000",
    addressStreet: "AV REPÚBLICA ARGENTINA",
    addressNumber: "3800",
    neighborhood: "NOVO MUNDO",
    city: "Curitiba",
    stateCode: "PR",
  },
  {
    chave: "clinica",
    name: `${MARCA} CLÍNICA VIDA PLENA LTDA`,
    displayName: `${MARCA} Clínica Vida Plena`,
    tradeName: "Clínica Vida Plena",
    cnpj: cnpjFicticio(4),
    cnaePrincipal: "8630-5/03",
    taxRegime: REGIME,
    zipCode: "80240-000",
    addressStreet: "AV SETE DE SETEMBRO",
    addressNumber: "4200",
    neighborhood: "BATEL",
    city: "Curitiba",
    stateCode: "PR",
  },
];

const CARGOS: readonly CargoDaDemo[] = [
  { chave: "padaria.auxiliar", empresa: "padaria", name: "Auxiliar de Produção", area: "Produção" },
  { chave: "padaria.atendente", empresa: "padaria", name: "Atendente de Balcão", area: "Atendimento" },
  { chave: "padaria.padeiro", empresa: "padaria", name: "Padeiro", area: "Produção" },
  { chave: "padaria.gerente", empresa: "padaria", name: "Gerente de Loja", area: "Administrativo" },
  { chave: "mercado.caixa", empresa: "mercado", name: "Operador de Caixa", area: "Atendimento" },
  { chave: "mercado.administrativo", empresa: "mercado", name: "Assistente Administrativo", area: "Administrativo" },
  { chave: "mercado.repositor", empresa: "mercado", name: "Repositor", area: "Operação" },
  { chave: "construtora.comercial", empresa: "construtora", name: "Consultor Comercial", area: "Comercial" },
  { chave: "construtora.financeiro", empresa: "construtora", name: "Analista Financeiro", area: "Financeiro" },
  { chave: "construtora.mestre", empresa: "construtora", name: "Mestre de Obras", area: "Obras" },
  { chave: "clinica.recepcao", empresa: "clinica", name: "Recepcionista", area: "Atendimento" },
  { chave: "clinica.enfermagem", empresa: "clinica", name: "Técnico de Enfermagem", area: "Saúde" },
  { chave: "clinica.ti", empresa: "clinica", name: "Estagiário de Suporte de TI", area: "Tecnologia" },
];

const ETIQUETAS: readonly EtiquetaDaDemo[] = [
  { name: ETIQUETA_MARCADORA, color: "#586577" },
  { name: `${MARCA} Atendimento`, color: "#2F6FDE" },
  { name: `${MARCA} Excel`, color: "#0E8A6A" },
  { name: `${MARCA} Turno da manhã`, color: "#B7791F" },
  { name: `${MARCA} CNH B`, color: "#7A4CC2" },
  { name: `${MARCA} Banco de talentos`, color: "#C2410C" },
];
const TAG = {
  atendimento: ETIQUETAS[1]!.name,
  excel: ETIQUETAS[2]!.name,
  manha: ETIQUETAS[3]!.name,
  cnh: ETIQUETAS[4]!.name,
  talentos: ETIQUETAS[5]!.name,
} as const;

// ─── Requisitos ─────────────────────────────────────────────────────────────

const O = (texto: string, peso: 1 | 2 | 3) => ({ tipo: "OBRIGATORIO" as const, texto, peso });
const D = (texto: string, peso: 1 | 2 | 3) => ({ tipo: "DESEJAVEL" as const, texto, peso });

function itens(lista: { tipo: "OBRIGATORIO" | "DESEJAVEL"; texto: string; peso: 1 | 2 | 3 }[]): Requisito[] {
  return lista.map((r, i) => ({ id: `r${i + 1}`, ...r }));
}

// ─── Triagem: veredictos e nota ─────────────────────────────────────────────

const EVIDENCIA: Record<Veredito, readonly string[]> = {
  SIM: ["Experiência compatível no histórico informado.", "Atende pelo que informou na inscrição.", "Cita isso no emprego mais recente."],
  PARCIAL: ["Tem experiência parecida, mas por pouco tempo.", "Atende em parte: ainda está cursando.", "Experiência próxima, em outra área."],
  NAO: ["Pelo que informou, não atende.", "Disse que não tem esta disponibilidade."],
  SEM_EVIDENCIA: ["Não há informação sobre isto.", "Não mencionou; vale confirmar na entrevista."],
};

/**
 * O veredito de cada requisito para um candidato de qualidade alta, média ou
 * baixa. A `semente` varia o desenho entre candidatos — notas todas iguais não
 * testariam a ordenação do quadro.
 */
export function vereditosDaDemo(lista: Requisito[], qualidade: Qualidade, semente: number): Veredito[] {
  let o = 0;
  let d = 0;
  return lista.map((r) => {
    if (r.tipo === "OBRIGATORIO") {
      const i = o++;
      if (qualidade === "alta") return "SIM";
      if (qualidade === "media") return i === 0 ? "SIM" : "PARCIAL";
      return i === 0 ? "NAO" : "PARCIAL";
    }
    const j = d++;
    if (qualidade === "alta") return (j + semente) % 3 === 2 ? "PARCIAL" : "SIM";
    if (qualidade === "media") return (["PARCIAL", "SEM_EVIDENCIA", "SIM", "NAO"] as const)[(j + semente) % 4]!;
    return (["NAO", "SEM_EVIDENCIA"] as const)[(j + semente) % 2]!;
  });
}

function resumoDaNota(lista: Requisito[], v: Veredito[]): string {
  const com = (alvo: Veredito) => lista.filter((_, i) => v[i] === alvo);
  const partes = [`Atende a ${com("SIM").length} de ${lista.length} requisitos.`];
  const obrigatorioNao = lista.find((r, i) => r.tipo === "OBRIGATORIO" && v[i] === "NAO");
  if (obrigatorioNao) partes.push(`Não mostra o obrigatório "${obrigatorioNao.texto}".`);
  const parcial = com("PARCIAL")[0];
  if (parcial) partes.push(`Em parte: "${parcial.texto}".`);
  const semInfo = com("SEM_EVIDENCIA")[0];
  if (semInfo) partes.push(`Confirmar na entrevista: "${semInfo.texto}".`);
  return partes.join(" ");
}

function notaDaDemo(
  versao: VersaoDosRequisitos,
  qualidade: Qualidade,
  semente: number,
  origem: NotaDaDemo["origem"],
  createdAt: Date
): NotaDaDemo {
  const v = vereditosDaDemo(versao.itens, qualidade, semente);
  const avaliacoes = versao.itens.map((r, i) => {
    const frases = EVIDENCIA[v[i]!];
    return { requisitoId: r.id, veredito: v[i]!, evidencia: frases[(i + semente) % frases.length]! };
  });
  const nota = calcularNota(versao, avaliacoes);
  return { versao: versao.versao, score: nota.score, faixa: nota.faixa, avaliacoes, resumo: resumoDaNota(versao.itens, v), origem, createdAt };
}

// ─── DISC ───────────────────────────────────────────────────────────────────

type Contagem = Record<DiscDimension, number>;
const DIMENSOES: DiscDimension[] = ["D", "I", "S", "C"];

/** 24 dimensões, intercaladas: as de contagem maior primeiro em cada volta. */
function sequencia(c: Contagem): DiscDimension[] {
  const resto = { ...c };
  const ordem = [...DIMENSOES].sort((a, b) => c[b] - c[a] || DIMENSOES.indexOf(a) - DIMENSOES.indexOf(b));
  const saida: DiscDimension[] = [];
  while (saida.length < TOTAL_BLOCKS) {
    let andou = false;
    for (const dim of ordem) {
      if (resto[dim] > 0) {
        saida.push(dim);
        resto[dim]--;
        andou = true;
      }
    }
    if (!andou) throw new Error("Contagem do DISC precisa somar 24.");
  }
  return saida;
}

/**
 * As respostas de um DISC com as contagens pedidas de "mais como eu" e "menos
 * como eu" por dimensão — cada uma somando 24. Em cada bloco, mais ≠ menos.
 */
export function respostasDoDisc(mais: Contagem, menos: Contagem): DiscAnswer[] {
  const m = sequencia(mais);
  const n = sequencia(menos);
  for (let i = 0; i < TOTAL_BLOCKS; i++) {
    if (m[i] !== n[i]) continue;
    const j = n.findIndex((dim, k) => k !== i && dim !== m[i] && m[k] !== n[i]);
    if (j < 0) throw new Error("Não foi possível montar as respostas do DISC.");
    [n[i], n[j]] = [n[j]!, n[i]!];
  }
  return m.map((dim, block) => ({
    block,
    maisIndex: DISC_BANK[block]!.findIndex((w) => w.dim === dim),
    menosIndex: DISC_BANK[block]!.findIndex((w) => w.dim === n[block]),
  }));
}

function discRespondido(mais: Contagem, menos: Contagem): NonNullable<TesteDaDemo["disc"]> {
  const answers = respostasDoDisc(mais, menos);
  const r = scoreDisc(answers);
  return { answers, scores: r.scores, primaryProfile: r.primaryProfile, secondaryProfile: r.secondaryProfile };
}

// ─── Questionário ───────────────────────────────────────────────────────────

const QUESTIONARIO: QuestionarioDaDemo = {
  name: `${MARCA} Rotinas de escritório`,
  description: "Questionário fictício da demonstração: 10 perguntas de múltipla escolha sobre rotinas administrativas.",
  perguntas: [
    { text: "Qual documento comprova a venda de uma mercadoria?", options: ["Nota fiscal", "Recibo de aluguel", "Orçamento", "Pedido de compra"], correctIndex: 0 },
    { text: "Em uma planilha, qual função soma os valores de um intervalo?", options: ["=MÉDIA()", "=SOMA()", "=CONT.SE()", "=PROCV()"], correctIndex: 1 },
    { text: "Quanto é 15% de R$ 2.000,00?", options: ["R$ 150,00", "R$ 200,00", "R$ 300,00", "R$ 1.500,00"], correctIndex: 2 },
    {
      text: "O que significa a sigla CLT?",
      options: ["Consolidação das Leis do Trabalho", "Código de Licenças Trabalhistas", "Cadastro de Lançamentos Tributários", "Contrato de Locação Temporária"],
      correctIndex: 0,
    },
    {
      text: "Um cliente liga reclamando de um atraso. Qual é a primeira atitude mais adequada?",
      options: ["Ouvir com atenção e registrar o problema", "Transferir a ligação sem explicar", "Dizer que a culpa é de outro setor", "Pedir que ligue mais tarde"],
      correctIndex: 0,
    },
    { text: "Qual destes números identifica o trabalhador no FGTS e no INSS?", options: ["PIS/NIS", "CNAE", "CNPJ", "NCM"], correctIndex: 0 },
    {
      text: "Um produto custa R$ 80,00 e é vendido por R$ 100,00. Qual é a margem sobre o preço de venda?",
      options: ["10%", "20%", "25%", "80%"],
      correctIndex: 1,
    },
    {
      text: "Qual frase está escrita corretamente?",
      options: ["Segue em anexo os documentos.", "Seguem anexos os documentos.", "Segue anexos os documentos.", "Seguem anexo os documentos."],
      correctIndex: 1,
    },
    {
      text: "Chega um e-mail pedindo a senha do banco \"com urgência\". O que fazer?",
      options: ["Responder com a senha", "Não responder e avisar o responsável", "Encaminhar para os colegas", "Clicar no link para conferir"],
      correctIndex: 1,
    },
    {
      text: "Qual é a ordem do mais antigo para o mais recente: 03/09, 28/08 e 15/09?",
      options: ["03/09, 28/08, 15/09", "28/08, 03/09, 15/09", "15/09, 03/09, 28/08", "28/08, 15/09, 03/09"],
      correctIndex: 1,
    },
  ],
};

/** As escolhas de quem acertou tudo menos as perguntas `erradas` (números de 1 a 10). */
function escolhasComErros(erradas: number[]): number[] {
  return QUESTIONARIO.perguntas.map((q, i) => (erradas.includes(i + 1) ? (q.correctIndex + 1) % q.options.length : q.correctIndex));
}

// ─── Montagem ───────────────────────────────────────────────────────────────

type DefPessoa = {
  chave: string;
  name: string;
  nasc: string;
  education: string;
  bairro: string;
  rua: string;
  cep: string;
  city?: string;
  etiquetas?: string[];
  notes?: string;
};

const CANDIDATOS: readonly DefPessoa[] = [
  { chave: "ana", name: "Ana Paula Ribeiro", nasc: "1998-03-12", education: "Ensino médio completo", bairro: "Boqueirão", rua: "R Antônio Bianchetti", cep: "81650-000", etiquetas: [TAG.manha] },
  { chave: "bruno", name: "Bruno Henrique Costa", nasc: "2001-07-25", education: "Ensino médio completo", bairro: "Cajuru", rua: "R Dr Petrônio Romero de Souza", cep: "82940-000", etiquetas: [TAG.manha] },
  { chave: "camila", name: "Camila Ferreira Santos", nasc: "1995-11-02", education: "Curso técnico em Gastronomia", bairro: "Bacacheri", rua: "R Rio Jari", cep: "82510-000", etiquetas: [TAG.manha], notes: "Indicada pela gerente da loja; trabalhou na confeitaria da família." },
  { chave: "diego", name: "Diego Martins Rocha", nasc: "1993-05-19", education: "Ensino médio completo", bairro: "Sítio Cercado", rua: "R Izaac Ferreira da Cruz", cep: "81900-000" },
  { chave: "eduarda", name: "Eduarda Lima Gonçalves", nasc: "1999-09-08", education: "Ensino médio completo", bairro: "Hauer", rua: "R Waldemar Kost", cep: "81630-000", etiquetas: [TAG.manha] },
  { chave: "felipe", name: "Felipe Augusto Nunes", nasc: "2003-01-30", education: "Ensino médio incompleto", bairro: "Pinheirinho", rua: "R Nicola Pellanda", cep: "81880-000", etiquetas: [TAG.talentos] },
  { chave: "gabriela", name: "Gabriela Moraes Teixeira", nasc: "1997-04-17", education: "Ensino superior incompleto (Administração)", bairro: "Água Verde", rua: "R Brasílio Itiberê", cep: "80240-060", etiquetas: [TAG.atendimento] },
  { chave: "henrique", name: "Henrique Batista Moura", nasc: "2000-12-03", education: "Ensino médio completo", bairro: "Portão", rua: "R João Bettega", cep: "81070-000" },
  { chave: "isadora", name: "Isadora Campos Pires", nasc: "2005-06-21", education: "Ensino médio em andamento", bairro: "Capão Raso", rua: "R Pastor Antônio Polito", cep: "81130-000" },
  { chave: "joao", name: "João Victor Almeida", nasc: "1996-08-14", education: "Ensino médio completo", bairro: "Rebouças", rua: "R Engenheiros Rebouças", cep: "80230-040", etiquetas: [TAG.atendimento] },
  { chave: "juliana", name: "Juliana Prado Correia", nasc: "1994-02-27", education: "Ensino médio completo", bairro: "Centro", rua: "R Marechal Deodoro", cep: "80010-010", etiquetas: [TAG.atendimento, TAG.talentos] },
  { chave: "kaique", name: "Kaique Araújo Mendes", nasc: "2002-10-09", education: "Ensino médio completo", bairro: "Afonso Pena", rua: "R Joinville", cep: "83045-000", city: "São José dos Pinhais" },
  { chave: "larissa", name: "Larissa Cristina Barros", nasc: "1999-01-15", education: "Ensino médio completo", bairro: "Centro", rua: "R Voluntários da Pátria", cep: "83005-020", city: "São José dos Pinhais", etiquetas: [TAG.atendimento] },
  { chave: "leonardo", name: "Leonardo Silveira Dias", nasc: "1992-07-04", education: "Ensino médio completo", bairro: "Boneca do Iguaçu", rua: "R Paulo Ildefonso Assumpção", cep: "83040-000", city: "São José dos Pinhais" },
  { chave: "mariana", name: "Mariana Vieira Castro", nasc: "1990-03-29", education: "Ensino médio completo", bairro: "Cidade Jardim", rua: "R Izabel A Redentora", cep: "83035-000", city: "São José dos Pinhais", notes: "Já trabalhou seis anos como operadora de caixa em rede de supermercados." },
  { chave: "matheus", name: "Matheus Rodrigues Lopes", nasc: "2004-11-11", education: "Ensino médio completo", bairro: "Xaxim", rua: "R Francisco Derosso", cep: "81710-000", etiquetas: [TAG.talentos] },
  { chave: "natalia", name: "Natália Freitas Cunha", nasc: "1996-09-23", education: "Técnico em Administração", bairro: "Cristo Rei", rua: "R Bom Jesus de Iguape", cep: "80050-000", etiquetas: [TAG.excel] },
  { chave: "otavio", name: "Otávio Pereira Brandão", nasc: "2005-02-08", education: "Cursando Análise e Desenvolvimento de Sistemas", bairro: "Mercês", rua: "R Padre Agostinho", cep: "80410-020" },
  { chave: "patricia", name: "Patrícia Monteiro Reis", nasc: "1991-12-01", education: "Ensino superior completo (Administração)", bairro: "Juvevê", rua: "R Augusto Stresser", cep: "80030-000", etiquetas: [TAG.excel] },
  { chave: "rafael", name: "Rafael Cardoso Pinto", nasc: "1989-06-16", education: "Técnico em Contabilidade", bairro: "Centro", rua: "R Barão do Rio Branco", cep: "80010-180", etiquetas: [TAG.excel] },
  { chave: "renata", name: "Renata Azevedo Farias", nasc: "1993-10-30", education: "Ensino superior incompleto (Marketing)", bairro: "Bigorrilho", rua: "R Padre Anchieta", cep: "80730-000" },
  { chave: "rodrigo", name: "Rodrigo Tavares Siqueira", nasc: "1987-04-05", education: "Ensino superior completo (Gestão Comercial)", bairro: "Ecoville", rua: "R Prof Pedro Viriato Parigot de Souza", cep: "81200-100", etiquetas: [TAG.cnh] },
  { chave: "sabrina", name: "Sabrina Oliveira Duarte", nasc: "1995-08-19", education: "Ensino médio completo", bairro: "Novo Mundo", rua: "R Carlos Klemtz", cep: "81050-000" },
  { chave: "samuel", name: "Samuel Fonseca Ramos", nasc: "1990-01-22", education: "Ensino superior completo (Administração)", bairro: "Água Verde", rua: "Av Água Verde", cep: "80620-200", etiquetas: [TAG.cnh] },
  { chave: "talita", name: "Talita Souza Medeiros", nasc: "1997-05-28", education: "Cursando Ciências Contábeis", bairro: "Portão", rua: "R Carlos de Laet", cep: "81070-110", etiquetas: [TAG.excel] },
  { chave: "thiago", name: "Thiago Moreira Antunes", nasc: "1994-09-13", education: "Ensino superior completo (Economia)", bairro: "Fazendinha", rua: "R Eduardo Sprada", cep: "81320-000" },
  { chave: "vanessa", name: "Vanessa Cristina Lacerda", nasc: "1992-03-07", education: "Ensino superior completo (Ciências Contábeis)", bairro: "Batel", rua: "R Bento Viana", cep: "80240-110", etiquetas: [TAG.excel] },
  { chave: "vinicius", name: "Vinícius Carvalho Borges", nasc: "1998-12-18", education: "Cursando Administração", bairro: "Santa Felicidade", rua: "Av Manoel Ribas", cep: "82020-000" },
  { chave: "yasmin", name: "Yasmin Andrade Peixoto", nasc: "2000-05-02", education: "Ensino médio completo", bairro: "Batel", rua: "R Comendador Araújo", cep: "80420-000", etiquetas: [TAG.atendimento] },
  { chave: "william", name: "William Santana Freire", nasc: "2003-08-26", education: "Ensino médio completo", bairro: "Tatuquara", rua: "R Olívio Domingos Brugnago", cep: "81470-000" },
];

type DefColaborador = DefPessoa & {
  empresa: ChaveDaEmpresa;
  cargo: string;
  situacao: SituacaoDoVinculo;
  /** Data fixa (vínculo antigo) ou "mes" = neste mês, `dias` antes de hoje (no mínimo o dia 1). */
  admissao: string | { mes: number } | null;
  desligamento?: { mes: number };
  active?: boolean;
  salario: number;
};

const COLABORADORES: readonly DefColaborador[] = [
  { chave: "sergio", name: "Sérgio Luiz Kowalski", nasc: "1979-02-14", education: "Ensino fundamental completo", bairro: "Boa Vista", rua: "R Theodoro Makiolka", cep: "82560-000", empresa: "padaria", cargo: "padaria.padeiro", situacao: "ATIVO", admissao: "2019-06-03", salario: 2900 },
  { chave: "rosangela", name: "Rosângela Maria Kubiak", nasc: "1975-09-30", education: "Ensino superior completo (Administração)", bairro: "Cabral", rua: "R Bom Jesus", cep: "80035-010", empresa: "padaria", cargo: "padaria.gerente", situacao: "ATIVO", admissao: "2021-02-01", salario: 4800 },
  { chave: "lucas", name: "Lucas Gabriel Zanetti", nasc: "2002-04-11", education: "Ensino médio completo", bairro: "Hugo Lange", rua: "R Mateus Leme", cep: "80530-010", empresa: "padaria", cargo: "padaria.auxiliar", situacao: "ATIVO", admissao: { mes: 6 }, salario: 2000 },
  { chave: "claudia", name: "Cláudia Regina Machado", nasc: "1986-07-22", education: "Ensino médio completo", bairro: "Ahú", rua: "R Flávio Dallegrave", cep: "82200-000", empresa: "padaria", cargo: "padaria.atendente", situacao: "EM_FERIAS", admissao: "2024-03-11", salario: 1900 },
  { chave: "everton", name: "Everton José Pacheco", nasc: "1997-11-05", education: "Ensino médio completo", bairro: "Bairro Alto", rua: "R Jornalista Alceu Chichorro", cep: "82840-000", empresa: "padaria", cargo: "padaria.auxiliar", situacao: "DESLIGADO", admissao: "2025-02-17", desligamento: { mes: 3 }, active: false, salario: 2000 },
  { chave: "marcia", name: "Márcia Aparecida Gomes", nasc: "1983-05-09", education: "Ensino médio completo", bairro: "Centro", rua: "R Mendes Leitão", cep: "83005-040", city: "São José dos Pinhais", empresa: "mercado", cargo: "mercado.caixa", situacao: "ATIVO", admissao: "2022-08-01", salario: 1950 },
  { chave: "fabio", name: "Fábio Ricardo Nogueira", nasc: "1991-10-17", education: "Ensino médio completo", bairro: "Afonso Pena", rua: "R Rui Barbosa", cep: "83045-140", city: "São José dos Pinhais", empresa: "mercado", cargo: "mercado.repositor", situacao: "ATIVO", admissao: "2024-05-06", salario: 1850 },
  { chave: "daniela", name: "Daniela Souza Rangel", nasc: "1988-01-26", education: "Ensino médio completo", bairro: "Cidade Jardim", rua: "R Paulino de Siqueira Cortes", cep: "83035-120", city: "São José dos Pinhais", empresa: "mercado", cargo: "mercado.caixa", situacao: "AFASTADO", admissao: "2023-04-03", salario: 1950 },
  { chave: "igor", name: "Igor Lemos Bittencourt", nasc: "2004-03-02", education: "Ensino médio completo", bairro: "Pedro Moro", rua: "R Arthur Bernardes", cep: "83070-000", city: "São José dos Pinhais", empresa: "mercado", cargo: "mercado.repositor", situacao: "ADMISSAO_EM_ANDAMENTO", admissao: { mes: 2 }, salario: 1850 },
  { chave: "paulo", name: "Paulo César Ventura", nasc: "1972-12-12", education: "Técnico em Edificações", bairro: "Novo Mundo", rua: "R Pedro Gusso", cep: "81050-200", empresa: "construtora", cargo: "construtora.mestre", situacao: "ATIVO", admissao: "2018-09-10", salario: 6200 },
  { chave: "aline", name: "Aline Rocha Guimarães", nasc: "1990-06-06", education: "Ensino superior completo (Ciências Contábeis)", bairro: "Portão", rua: "R Pedro Ivo Abib", cep: "81070-220", empresa: "construtora", cargo: "construtora.financeiro", situacao: "ATIVO", admissao: "2022-01-17", salario: 4300 },
  { chave: "gustavo", name: "Gustavo Henrique Lima", nasc: "1989-03-18", education: "Ensino superior completo (Gestão Comercial)", bairro: "Água Verde", rua: "R Ubaldino do Amaral", cep: "80620-280", empresa: "construtora", cargo: "construtora.comercial", situacao: "EM_FERIAS", admissao: "2023-07-03", salario: 3500 },
  { chave: "bianca", name: "Bianca Moreira Sales", nasc: "1995-10-28", education: "Ensino superior incompleto (Marketing)", bairro: "Bigorrilho", rua: "R Martim Afonso", cep: "80730-030", empresa: "construtora", cargo: "construtora.comercial", situacao: "ADMISSAO_EM_ANDAMENTO", admissao: null, salario: 3000 },
  { chave: "simone", name: "Simone Albuquerque Prado", nasc: "1993-08-08", education: "Ensino médio completo", bairro: "Batel", rua: "R Saldanha Marinho", cep: "80410-150", empresa: "clinica", cargo: "clinica.recepcao", situacao: "ATIVO", admissao: "2024-09-02", salario: 2200 },
  { chave: "ricardo", name: "Ricardo Nascimento Paiva", nasc: "1985-04-24", education: "Técnico em Enfermagem", bairro: "Rebouças", rua: "R Desembargador Westphalen", cep: "80230-100", empresa: "clinica", cargo: "clinica.enfermagem", situacao: "ATIVO", admissao: "2020-11-16", salario: 3100 },
  { chave: "elaine", name: "Elaine Cristina Moraes", nasc: "1982-02-03", education: "Técnico em Enfermagem", bairro: "Guabirotuba", rua: "R Francisco H dos Santos", cep: "81520-000", empresa: "clinica", cargo: "clinica.enfermagem", situacao: "AFASTADO", admissao: "2022-05-09", salario: 3100 },
  { chave: "jessica", name: "Jéssica Fernandes Torres", nasc: "1998-07-29", education: "Ensino médio completo", bairro: "Centro", rua: "R Emiliano Perneta", cep: "80420-080", empresa: "clinica", cargo: "clinica.recepcao", situacao: "DESLIGADO", admissao: "2025-06-02", desligamento: { mes: 1 }, salario: 2200 },
];

type DefVaga = Omit<VagaDaDemo, "openedAt" | "closedAt" | "applicationDeadline" | "requisitos"> & {
  aberta: number;
  prazo: number;
  encerrada?: number;
  requisitos: { desde: number; itens: Requisito[]; corteCompativel: number; corteParcial: number }[];
};

const VAGAS: readonly DefVaga[] = [
  {
    chave: "producao",
    empresa: "padaria",
    cargo: "padaria.auxiliar",
    title: "Auxiliar de Produção — Panificação",
    quantity: 2,
    priority: "ALTA",
    status: "ABERTA",
    isPublic: true,
    publicDescription:
      "A Padaria Pão Dourado está contratando auxiliares para a produção de pães, bolos e salgados. Você vai ajudar no preparo das massas, na organização da cozinha e no controle da validade dos insumos, seguindo as boas práticas de higiene.\n\nTurno das 5h às 13h20, de segunda a sábado, com uma folga na semana. Não precisa de experiência: ensinamos o ofício a quem tem vontade de aprender.",
    notes: "Duas vagas: uma para repor o desligamento de outubro e uma de aumento de quadro.",
    salaryMin: 1900,
    salaryMax: 2200,
    showSalary: true,
    workMode: "PRESENCIAL",
    contractType: "CLT",
    benefits: "Vale-transporte\nVale-alimentação de R$ 450,00\nCafé da manhã no local\nUniforme fornecido",
    workCity: "Curitiba",
    workStateCode: "PR",
    aberta: -18,
    prazo: 12,
    requisitos: [
      {
        desde: -18,
        itens: itens([
          O("Disponibilidade para o turno da manhã, a partir das 5h", 3),
          O("Ensino fundamental completo", 2),
          D("Experiência em cozinha, padaria ou confeitaria", 2),
          D("Agilidade e trabalho em equipe", 1),
        ]),
        corteCompativel: 75,
        corteParcial: 45,
      },
      {
        desde: -10,
        itens: itens([
          O("Disponibilidade para o turno da manhã, a partir das 5h", 3),
          O("Ensino fundamental completo", 2),
          D("Experiência em cozinha, padaria ou confeitaria", 3),
          D("Curso de boas práticas na manipulação de alimentos", 1),
          D("Agilidade e trabalho em equipe", 1),
        ]),
        corteCompativel: 75,
        corteParcial: 45,
      },
    ],
  },
  {
    chave: "balcao",
    empresa: "padaria",
    cargo: "padaria.atendente",
    title: "Atendente de Balcão",
    quantity: 3,
    priority: "MEDIA",
    status: "ABERTA",
    isPublic: true,
    publicDescription:
      "Procuramos atendentes para o balcão de pães, frios e café. A rotina inclui atender os clientes com simpatia, montar pedidos, operar a balança e manter a vitrine abastecida e limpa.\n\nEscala 6x1, com turnos das 6h às 14h20 ou das 13h40 às 22h. Valorizamos quem gosta de gente e mantém a calma no horário de pico.",
    notes: null,
    salaryMin: 1750,
    salaryMax: 1950,
    showSalary: false,
    workMode: "PRESENCIAL",
    contractType: "CLT",
    benefits: "Vale-transporte\nVale-alimentação\nDesconto nos produtos da casa",
    workCity: "Curitiba",
    workStateCode: "PR",
    aberta: -9,
    prazo: 15,
    requisitos: [
      {
        desde: -9,
        itens: itens([
          O("Ensino médio completo", 2),
          O("Disponibilidade para escala 6x1, inclusive nos fins de semana", 3),
          D("Experiência com atendimento ao público", 2),
          D("Experiência com frios ou balança", 1),
        ]),
        corteCompativel: 70,
        corteParcial: 40,
      },
    ],
  },
  {
    chave: "caixa",
    empresa: "mercado",
    cargo: "mercado.caixa",
    title: "Operador(a) de Caixa",
    quantity: 2,
    priority: "MEDIA",
    status: "ABERTA",
    isPublic: true,
    publicDescription:
      "O Mercado Bom Preço busca operadores de caixa para a loja de São José dos Pinhais. Você vai registrar as compras, receber em dinheiro, cartão e Pix, conferir o caixa no fim do turno e ajudar os clientes com trocas e dúvidas.\n\nTreinamento no sistema de frente de caixa nos primeiros dias.",
    notes: null,
    salaryMin: 1800,
    salaryMax: 2000,
    showSalary: true,
    workMode: "PRESENCIAL",
    contractType: "CLT",
    benefits: "Vale-transporte\nVale-alimentação de R$ 500,00\nPlano odontológico\nPrêmio por assiduidade",
    workCity: "São José dos Pinhais",
    workStateCode: "PR",
    aberta: -14,
    prazo: 10,
    requisitos: [
      {
        desde: -14,
        itens: itens([
          O("Ensino médio completo", 2),
          O("Facilidade com contas e troco", 3),
          D("Experiência como operador(a) de caixa", 3),
          D("Conhecimento de Pix e maquininhas de cartão", 1),
        ]),
        corteCompativel: 75,
        corteParcial: 45,
      },
    ],
  },
  {
    chave: "administrativo",
    empresa: "mercado",
    cargo: "mercado.administrativo",
    title: "Assistente Administrativo(a)",
    quantity: 1,
    priority: "BAIXA",
    status: "ABERTA",
    isPublic: true,
    publicDescription:
      "Vaga para apoiar o escritório da loja: lançar as notas dos fornecedores, conferir boletos, organizar os documentos dos funcionários para a contabilidade e atender fornecedores por telefone e e-mail.\n\nHorário comercial, de segunda a sexta.",
    notes: "Salário a combinar conforme a experiência — não divulgar faixa.",
    salaryMin: null,
    salaryMax: null,
    showSalary: false,
    workMode: "PRESENCIAL",
    contractType: "CLT",
    benefits: "Vale-transporte\nVale-refeição\nPlano odontológico",
    workCity: "São José dos Pinhais",
    workStateCode: "PR",
    aberta: -5,
    prazo: 18,
    requisitos: [
      {
        desde: -5,
        itens: itens([
          O("Ensino médio completo", 2),
          O("Pacote Office, principalmente Excel", 3),
          D("Experiência com rotinas administrativas ou financeiras", 2),
          D("Curso técnico em Administração", 1),
          D("Boa escrita para e-mails", 1),
        ]),
        corteCompativel: 75,
        corteParcial: 45,
      },
    ],
  },
  {
    chave: "comercial",
    empresa: "construtora",
    cargo: "construtora.comercial",
    title: "Consultor(a) Comercial — Imóveis na Planta",
    quantity: 1,
    priority: "ALTA",
    status: "ABERTA",
    isPublic: true,
    publicDescription:
      "A Construtora Horizonte Sul está ampliando o time comercial para os lançamentos na região sul de Curitiba. Você vai atender quem chega pelo site e pelo plantão de vendas, apresentar os empreendimentos, simular o financiamento e acompanhar o cliente até a assinatura do contrato.\n\nSalário fixo mais comissão por venda.",
    notes: null,
    salaryMin: 2500,
    salaryMax: 4000,
    showSalary: true,
    workMode: "HIBRIDO",
    contractType: "CLT",
    benefits: "Comissão sobre as vendas\nVale-alimentação\nPlano de saúde\nAuxílio-combustível nos dias de plantão",
    workCity: "Curitiba",
    workStateCode: "PR",
    aberta: -20,
    prazo: 11,
    requisitos: [
      {
        desde: -20,
        itens: itens([
          O("Experiência com vendas consultivas", 3),
          O("Carteira de habilitação categoria B", 2),
          D("Experiência no mercado imobiliário", 2),
          D("Conhecimento de financiamento habitacional", 2),
          D("Ensino superior em andamento ou completo", 1),
        ]),
        corteCompativel: 80,
        corteParcial: 50,
      },
    ],
  },
  {
    chave: "financeiro",
    empresa: "construtora",
    cargo: "construtora.financeiro",
    title: "Analista Financeiro(a) — Contas a Pagar e a Receber",
    quantity: 1,
    priority: "MEDIA",
    status: "ABERTA",
    isPublic: true,
    publicDescription:
      "Buscamos uma pessoa para cuidar do contas a pagar e a receber das obras: programar pagamentos, conciliar os extratos bancários, emitir boletos e acompanhar a inadimplência dos compradores. Trabalho em conjunto com a contabilidade no fechamento do mês.\n\nTrês dias no escritório e dois em casa.",
    notes: null,
    salaryMin: 3800,
    salaryMax: 4500,
    showSalary: false,
    workMode: "HIBRIDO",
    contractType: "CLT",
    benefits: "Plano de saúde\nVale-refeição\nParticipação nos resultados",
    workCity: "Curitiba",
    workStateCode: "PR",
    aberta: -11,
    prazo: 14,
    requisitos: [
      {
        desde: -11,
        itens: itens([
          O("Ensino superior em Ciências Contábeis, Administração ou Economia (cursando ou completo)", 3),
          O("Experiência com contas a pagar e a receber", 3),
          D("Conciliação bancária", 2),
          D("Excel intermediário (PROCV e tabela dinâmica)", 2),
          D("Vivência no setor de construção civil", 1),
        ]),
        corteCompativel: 75,
        corteParcial: 45,
      },
    ],
  },
  {
    chave: "recepcao",
    empresa: "clinica",
    cargo: "clinica.recepcao",
    title: "Recepcionista",
    quantity: 1,
    priority: "ALTA",
    status: "ABERTA",
    isPublic: true,
    publicDescription:
      "A Clínica Vida Plena procura recepcionista para o atendimento dos pacientes: agendar consultas por telefone e WhatsApp, conferir os convênios, receber os pacientes e organizar a agenda dos médicos.\n\nHorário das 12h às 20h, de segunda a sexta, e um sábado por mês.",
    notes: "Substituição: a recepcionista da tarde saiu neste mês.",
    salaryMin: 2000,
    salaryMax: 2300,
    showSalary: true,
    workMode: "PRESENCIAL",
    contractType: "CLT",
    benefits: "Vale-transporte\nVale-alimentação\nPlano de saúde depois da experiência",
    workCity: "Curitiba",
    workStateCode: "PR",
    aberta: -7,
    prazo: 20,
    requisitos: [
      {
        desde: -7,
        itens: itens([
          O("Ensino médio completo", 2),
          O("Experiência com atendimento ao público", 3),
          D("Experiência em clínica ou consultório", 2),
          D("Conhecimento de convênios médicos", 1),
        ]),
        corteCompativel: 75,
        corteParcial: 45,
      },
    ],
  },
  {
    chave: "estagio",
    empresa: "clinica",
    cargo: "clinica.ti",
    title: "Estagiário(a) de Suporte de TI",
    quantity: 1,
    priority: "BAIXA",
    status: "ENCERRADA",
    isPublic: false,
    publicDescription:
      "Estágio para apoiar a clínica com computadores, impressoras, rede e o sistema de prontuário. Seis horas por dia, no período da manhã.",
    notes: "Vaga preenchida.",
    salaryMin: 1200,
    salaryMax: 1200,
    showSalary: true,
    workMode: "PRESENCIAL",
    contractType: "ESTAGIO",
    benefits: "Bolsa-auxílio\nVale-transporte",
    workCity: "Curitiba",
    workStateCode: "PR",
    aberta: -21,
    prazo: -4,
    encerrada: -2,
    requisitos: [
      {
        desde: -21,
        itens: itens([
          O("Cursando Análise e Desenvolvimento de Sistemas, Redes ou área afim", 3),
          D("Conhecimento de Windows e redes básicas", 2),
          D("Boa comunicação com os usuários", 1),
        ]),
        corteCompativel: 70,
        corteParcial: 40,
      },
    ],
  },
];

type DefCandidatura = {
  vaga: string;
  pessoa: string;
  origin: "PORTAL" | "Indicação" | "WhatsApp" | "LinkedIn";
  stage: Estagio;
  status?: Desfecho;
  qualidade: Qualidade;
  dia: number;
  motivo?: string;
  contratadaEm?: number;
  pretensao?: number;
  disponibilidade?: string;
  deslocamento?: number;
};

const CANDIDATURAS: readonly DefCandidatura[] = [
  // Auxiliar de Produção (2 versões de requisitos: quem chegou antes do dia -10 tem nota na versão 1)
  { vaga: "producao", pessoa: "ana", origin: "PORTAL", stage: "TRIAGEM", qualidade: "media", dia: -16, pretensao: 2100, disponibilidade: "Imediata", deslocamento: 35 },
  { vaga: "producao", pessoa: "bruno", origin: "WhatsApp", stage: "TRIAGEM", qualidade: "alta", dia: -6, pretensao: 2000, disponibilidade: "Imediata", deslocamento: 25 },
  { vaga: "producao", pessoa: "camila", origin: "Indicação", stage: "ENTREVISTA", qualidade: "alta", dia: -15, pretensao: 2200, disponibilidade: "Em até 15 dias", deslocamento: 20 },
  { vaga: "producao", pessoa: "diego", origin: "PORTAL", stage: "TESTE", qualidade: "alta", dia: -14, pretensao: 2150, disponibilidade: "Imediata", deslocamento: 45 },
  { vaga: "producao", pessoa: "eduarda", origin: "Indicação", stage: "CONTRATADO", status: "CONTRATADO", qualidade: "alta", dia: -17, contratadaEm: -3, pretensao: 2000, disponibilidade: "Imediata", deslocamento: 30 },
  { vaga: "producao", pessoa: "felipe", origin: "PORTAL", stage: "TRIAGEM", status: "REPROVADO", qualidade: "baixa", dia: -12, motivo: "Não tem disponibilidade para o turno da manhã.", pretensao: 2300, disponibilidade: "Em até 30 dias", deslocamento: 60 },
  // Atendente de Balcão
  { vaga: "balcao", pessoa: "gabriela", origin: "PORTAL", stage: "TRIAGEM", qualidade: "alta", dia: -7, pretensao: 1900, disponibilidade: "Em até 15 dias", deslocamento: 25 },
  { vaga: "balcao", pessoa: "henrique", origin: "WhatsApp", stage: "TRIAGEM", qualidade: "media", dia: -5, pretensao: 1850, disponibilidade: "Imediata", deslocamento: 40 },
  { vaga: "balcao", pessoa: "isadora", origin: "PORTAL", stage: "TRIAGEM", qualidade: "baixa", dia: -2, pretensao: 1700, disponibilidade: "Imediata", deslocamento: 50 },
  { vaga: "balcao", pessoa: "joao", origin: "Indicação", stage: "ENTREVISTA", qualidade: "alta", dia: -8 },
  { vaga: "balcao", pessoa: "juliana", origin: "PORTAL", stage: "ENTREVISTA", status: "DESISTENTE", qualidade: "media", dia: -8, motivo: "Aceitou outra proposta, mais perto de casa.", pretensao: 1950, disponibilidade: "Imediata", deslocamento: 55 },
  // Operador(a) de Caixa
  { vaga: "caixa", pessoa: "kaique", origin: "PORTAL", stage: "TRIAGEM", qualidade: "media", dia: -10, pretensao: 1900, disponibilidade: "Imediata", deslocamento: 15 },
  { vaga: "caixa", pessoa: "larissa", origin: "WhatsApp", stage: "TRIAGEM", qualidade: "alta", dia: -3, pretensao: 1950, disponibilidade: "Em até 15 dias", deslocamento: 20 },
  { vaga: "caixa", pessoa: "leonardo", origin: "PORTAL", stage: "ENTREVISTA", qualidade: "alta", dia: -12, pretensao: 2000, disponibilidade: "Imediata", deslocamento: 10 },
  { vaga: "caixa", pessoa: "mariana", origin: "Indicação", stage: "TESTE", qualidade: "alta", dia: -11, pretensao: 2100, disponibilidade: "Em até 30 dias", deslocamento: 25 },
  { vaga: "caixa", pessoa: "matheus", origin: "PORTAL", stage: "ENTREVISTA", status: "REPROVADO", qualidade: "media", dia: -13, motivo: "Na entrevista, mostrou pouca segurança com troco e fechamento de caixa.", pretensao: 1800, disponibilidade: "Imediata", deslocamento: 45 },
  // Assistente Administrativo(a)
  { vaga: "administrativo", pessoa: "natalia", origin: "LinkedIn", stage: "TRIAGEM", qualidade: "alta", dia: -3, pretensao: 2600, disponibilidade: "Em até 30 dias" },
  { vaga: "administrativo", pessoa: "otavio", origin: "PORTAL", stage: "TRIAGEM", qualidade: "baixa", dia: -1, pretensao: 2000, disponibilidade: "Imediata", deslocamento: 50 },
  { vaga: "administrativo", pessoa: "patricia", origin: "PORTAL", stage: "TESTE", qualidade: "alta", dia: -4, pretensao: 2800, disponibilidade: "Em até 15 dias", deslocamento: 40 },
  { vaga: "administrativo", pessoa: "rafael", origin: "Indicação", stage: "PROPOSTA", qualidade: "alta", dia: -5, pretensao: 2700, disponibilidade: "Em até 15 dias", deslocamento: 30 },
  // Consultor(a) Comercial
  { vaga: "comercial", pessoa: "renata", origin: "LinkedIn", stage: "TRIAGEM", qualidade: "media", dia: -6, pretensao: 3500, disponibilidade: "Em até 30 dias" },
  { vaga: "comercial", pessoa: "rodrigo", origin: "LinkedIn", stage: "ENTREVISTA", qualidade: "alta", dia: -17, pretensao: 4500, disponibilidade: "Em até 30 dias", deslocamento: 30 },
  { vaga: "comercial", pessoa: "sabrina", origin: "Indicação", stage: "ENTREVISTA", qualidade: "media", dia: -15, pretensao: 3000, disponibilidade: "Imediata", deslocamento: 15 },
  { vaga: "comercial", pessoa: "samuel", origin: "PORTAL", stage: "PROPOSTA", qualidade: "alta", dia: -19, pretensao: 4000, disponibilidade: "Em até 15 dias", deslocamento: 20 },
  // Analista Financeiro(a)
  { vaga: "financeiro", pessoa: "talita", origin: "LinkedIn", stage: "TRIAGEM", qualidade: "alta", dia: -4, pretensao: 4000, disponibilidade: "Em até 30 dias" },
  { vaga: "financeiro", pessoa: "thiago", origin: "PORTAL", stage: "ENTREVISTA", qualidade: "media", dia: -9, pretensao: 4800, disponibilidade: "Mais de 30 dias", deslocamento: 35 },
  { vaga: "financeiro", pessoa: "vanessa", origin: "LinkedIn", stage: "TESTE", qualidade: "alta", dia: -10, pretensao: 4400, disponibilidade: "Em até 30 dias", deslocamento: 15 },
  { vaga: "financeiro", pessoa: "vinicius", origin: "PORTAL", stage: "TESTE", status: "REPROVADO", qualidade: "media", dia: -10, motivo: "Resultado do teste de conhecimentos abaixo do esperado para a vaga.", pretensao: 3900, disponibilidade: "Imediata", deslocamento: 45 },
  // Recepcionista
  { vaga: "recepcao", pessoa: "yasmin", origin: "PORTAL", stage: "TRIAGEM", qualidade: "alta", dia: -2, pretensao: 2200, disponibilidade: "Imediata", deslocamento: 10 },
  { vaga: "recepcao", pessoa: "william", origin: "WhatsApp", stage: "TRIAGEM", qualidade: "baixa", dia: -1, pretensao: 2000, disponibilidade: "Imediata", deslocamento: 70 },
  { vaga: "recepcao", pessoa: "gabriela", origin: "PORTAL", stage: "ENTREVISTA", qualidade: "alta", dia: -6, pretensao: 2200, disponibilidade: "Em até 15 dias", deslocamento: 15 },
  { vaga: "recepcao", pessoa: "juliana", origin: "WhatsApp", stage: "TESTE", qualidade: "alta", dia: -5, pretensao: 2150, disponibilidade: "Imediata", deslocamento: 30 },
  // Estágio de TI (encerrada)
  { vaga: "estagio", pessoa: "otavio", origin: "Indicação", stage: "CONTRATADO", status: "CONTRATADO", qualidade: "alta", dia: -19, contratadaEm: -3 },
  { vaga: "estagio", pessoa: "william", origin: "PORTAL", stage: "ENTREVISTA", status: "REPROVADO", qualidade: "baixa", dia: -18, motivo: "Não está matriculado em curso da área, exigência do estágio." },
];

type DefEntrevista = Omit<EntrevistaDaDemo, "candidatura" | "stage" | "createdAt"> & { vaga: string; pessoa: string; dia: number };

const ENTREVISTAS: readonly DefEntrevista[] = [
  { vaga: "producao", pessoa: "camila", avaliador: "principal", dia: -4, comunicacao: 4, tecnico: 4, fitCultural: 5, experiencia: 3, recommendation: "AVANCAR", notes: "Comunicativa, já trabalhou na confeitaria da família. Tem disponibilidade para o turno da manhã." },
  { vaga: "producao", pessoa: "diego", avaliador: "principal", dia: -8, comunicacao: 4, tecnico: 4, fitCultural: 4, experiencia: 4, recommendation: "AVANCAR", notes: "Dois anos em padaria de bairro. Pontual e objetivo nas respostas." },
  { vaga: "producao", pessoa: "eduarda", avaliador: "principal", dia: -9, comunicacao: 5, tecnico: 4, fitCultural: 5, experiencia: 4, recommendation: "AVANCAR", notes: "Muito boa impressão. Mora perto e começa de imediato." },
  { vaga: "producao", pessoa: "eduarda", avaliador: "segundo", dia: -8, comunicacao: 4, tecnico: 4, fitCultural: 5, experiencia: 4, recommendation: "AVANCAR", notes: "De acordo. Gerente da loja aprovou no teste prático." },
  { vaga: "balcao", pessoa: "joao", avaliador: "principal", dia: -2, comunicacao: 4, tecnico: 3, fitCultural: 4, experiencia: 2, recommendation: "TALVEZ", notes: "Simpático e atencioso, mas nunca trabalhou com balança nem com frios." },
  { vaga: "caixa", pessoa: "leonardo", avaliador: "principal", dia: -3, comunicacao: 4, tecnico: 4, fitCultural: 4, experiencia: 3, recommendation: "AVANCAR", notes: "Um ano de caixa em farmácia. Boa conta de cabeça." },
  { vaga: "caixa", pessoa: "matheus", avaliador: "principal", dia: -6, comunicacao: 3, tecnico: 2, fitCultural: 3, experiencia: 2, recommendation: "REPROVAR", notes: "Ficou inseguro na simulação de troco e de fechamento de caixa." },
  { vaga: "comercial", pessoa: "rodrigo", avaliador: "principal", dia: -5, comunicacao: 5, tecnico: 4, fitCultural: 4, experiencia: 5, recommendation: "AVANCAR", notes: "Seis anos em vendas de imóveis. Conhece bem o financiamento pela Caixa." },
  { vaga: "comercial", pessoa: "samuel", avaliador: "principal", dia: -10, comunicacao: 5, tecnico: 4, fitCultural: 4, experiencia: 4, recommendation: "AVANCAR", notes: "Ótima apresentação e bom histórico de metas batidas." },
  { vaga: "comercial", pessoa: "samuel", avaliador: "segundo", dia: -9, comunicacao: 4, tecnico: 3, fitCultural: 4, experiencia: 4, recommendation: "TALVEZ", notes: "Bom perfil; pretensão um pouco acima da faixa." },
  { vaga: "financeiro", pessoa: "thiago", avaliador: "principal", dia: -3, comunicacao: 3, tecnico: 4, fitCultural: 3, experiencia: 3, recommendation: "TALVEZ", notes: "Conhece bem Excel; só pode começar daqui a 45 dias." },
  { vaga: "estagio", pessoa: "william", avaliador: "principal", dia: -12, comunicacao: 3, tecnico: 2, fitCultural: 3, experiencia: 1, recommendation: "REPROVAR", notes: "Não está matriculado em curso da área." },
];

/** Contagens de "mais como eu" e "menos como eu" por dimensão (cada uma soma 24). */
const PERFIS_DISC: Record<string, { mais: Contagem; menos: Contagem }> = {
  // Estabilidade: paciente, constante.
  estavel: { mais: { D: 3, I: 4, S: 10, C: 7 }, menos: { D: 10, I: 7, S: 3, C: 4 } },
  // Dominância e Influência empatadas: o perfil combinado.
  comercial: { mais: { D: 9, I: 9, S: 3, C: 3 }, menos: { D: 3, I: 3, S: 9, C: 9 } },
  // Conformidade, com Estabilidade de segundo.
  analitico: { mais: { D: 3, I: 3, S: 8, C: 10 }, menos: { D: 8, I: 10, S: 3, C: 3 } },
};

type DefTeste = {
  vaga: string;
  pessoa: string;
  type: "DISC" | "MULTIPLA_ESCOLHA";
  criado: number;
  /** Respondido `respondido` dias depois de criado; sem isto, pendente. */
  respondido?: number;
  perfil?: keyof typeof PERFIS_DISC;
  erradas?: number[];
};

const TESTES: readonly DefTeste[] = [
  { vaga: "producao", pessoa: "eduarda", type: "DISC", criado: -8, respondido: 1, perfil: "estavel" },
  { vaga: "comercial", pessoa: "samuel", type: "DISC", criado: -9, respondido: 1, perfil: "comercial" },
  { vaga: "administrativo", pessoa: "rafael", type: "DISC", criado: -3, respondido: 1, perfil: "analitico" },
  { vaga: "administrativo", pessoa: "patricia", type: "MULTIPLA_ESCOLHA", criado: -3, respondido: 1, erradas: [3, 7] },
  { vaga: "financeiro", pessoa: "vinicius", type: "MULTIPLA_ESCOLHA", criado: -6, respondido: 2, erradas: [2, 3, 7, 8, 10] },
  // Pendentes: o link vale 7 dias.
  { vaga: "recepcao", pessoa: "juliana", type: "DISC", criado: -1 },
  { vaga: "caixa", pessoa: "mariana", type: "MULTIPLA_ESCOLHA", criado: -2 },
  // Vencido: criado há 10 dias, venceu há 3, sem resposta.
  { vaga: "producao", pessoa: "diego", type: "DISC", criado: -10 },
];

const DIA_MS = 86_400_000;
const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * Monta a demonstração inteira para o dia de `agora` (em São Paulo). Mesma
 * entrada, mesma saída — os ids e os tokens dos testes só nascem na gravação.
 */
export function montarDemonstracao(agora: Date): PlanoDaDemonstracao {
  const hoje = hojeIso(agora);
  const diaDoMes = Number(hoje.slice(8, 10));
  /** Data de calendário (meia-noite UTC), como as datas de formulário do Connect. */
  const data = (offset: number) => new Date(`${somarDias(hoje, offset)}T00:00:00.000Z`);
  /** Um instante no dia `offset`, na hora de Brasília pedida (UTC−3). */
  const instante = (offset: number, hora: number, minuto = 0) =>
    new Date(`${somarDias(hoje, offset)}T${p2(hora + 3)}:${p2(minuto)}:00.000Z`);
  /** Um dia deste mês, `dias` antes de hoje — sem sair do mês. */
  const nesteMes = (dias: number) => data(-Math.min(dias, diaDoMes - 1));

  const vagas: VagaDaDemo[] = VAGAS.map((v) => {
    const { aberta, prazo, encerrada, requisitos, ...resto } = v;
    return {
      ...resto,
      openedAt: instante(aberta, 9, 15),
      closedAt: encerrada === undefined ? null : instante(encerrada, 17, 40),
      applicationDeadline: data(prazo),
      requisitos: requisitos.map((r, i) => ({
        versao: i + 1,
        itens: r.itens,
        corteCompativel: r.corteCompativel,
        corteParcial: r.corteParcial,
        createdAt: instante(r.desde, 9, 30),
      })),
    };
  });
  const vagaPorChave = new Map(vagas.map((v) => [v.chave, v]));

  // Quando cada candidato apareceu pela primeira vez (a ficha é criada aí).
  const primeiraVez = new Map<string, number>();
  for (const c of CANDIDATURAS) primeiraVez.set(c.pessoa, Math.min(primeiraVez.get(c.pessoa) ?? 0, c.dia));

  let n = 0;
  const pessoaBase = (d: DefPessoa) => {
    n++;
    return {
      chave: d.chave,
      name: d.name,
      cpf: cpfFicticio(n),
      email: emailFicticio(d.name),
      phone: telefoneFicticio(n),
      birthDate: new Date(`${d.nasc}T00:00:00.000Z`),
      education: d.education,
      zipCode: d.cep,
      addressStreet: d.rua,
      addressNumber: String(100 + ((n * 37) % 1900)),
      neighborhood: d.bairro,
      city: d.city ?? "Curitiba",
      stateCode: "PR" as const,
      notes: d.notes ?? null,
      etiquetas: [ETIQUETA_MARCADORA, ...(d.etiquetas ?? [])],
    };
  };

  const pessoas: PessoaDaDemo[] = [
    ...CANDIDATOS.map((d) => ({
      ...pessoaBase(d),
      type: "CANDIDATO" as const,
      createdAt: instante(primeiraVez.get(d.chave) ?? -1, 8, 5),
      empresa: null,
      cargo: null,
      // O padrão do schema para toda pessoa; não diz nada sobre candidato.
      employmentStatus: "ADMISSAO_EM_ANDAMENTO" as const,
      active: true,
      admissionDate: null,
      dismissalDate: null,
      currentSalary: null,
    })),
    ...COLABORADORES.map((d) => {
      const admissao = d.admissao === null ? null : typeof d.admissao === "string" ? new Date(`${d.admissao}T00:00:00.000Z`) : nesteMes(d.admissao.mes);
      return {
        ...pessoaBase(d),
        type: "COLABORADOR" as const,
        createdAt: instante(-25, 10),
        empresa: d.empresa,
        cargo: d.cargo,
        employmentStatus: d.situacao,
        active: d.active ?? true,
        admissionDate: admissao,
        dismissalDate: d.desligamento ? nesteMes(d.desligamento.mes) : null,
        currentSalary: d.salario,
      };
    }),
  ];

  const candidaturas: CandidaturaDaDemo[] = CANDIDATURAS.map((c, i) => {
    const vaga = vagaPorChave.get(c.vaga)!;
    const status = c.status ?? "EM_ANDAMENTO";
    const criada = instante(c.dia, 8 + (i % 10), (i * 7) % 60);
    // Nota automática minutos depois de chegar, na versão vigente naquele dia;
    // quem seguia no processo quando veio a versão 2 foi repontuado em lote —
    // menos a Ana, para o quadro mostrar uma nota "desatualizada".
    const vigente = [...vaga.requisitos].reverse().find((r) => r.createdAt.getTime() <= criada.getTime()) ?? vaga.requisitos[0]!;
    const notas = [notaDaDemo(vigente, c.qualidade, i, "AUTO", new Date(criada.getTime() + 6 * 60_000))];
    const atual = vaga.requisitos.at(-1)!;
    const seguia = status !== "REPROVADO" && status !== "DESISTENTE";
    if (vigente.versao !== atual.versao && seguia && c.pessoa !== "ana") {
      notas.push(notaDaDemo(atual, c.qualidade, i, "LOTE", new Date(atual.createdAt.getTime() + 20 * 60_000)));
    }
    const fonte: OrigemDaResposta = c.origin === "PORTAL" ? "PORTAL" : c.origin === "WhatsApp" ? "WHATSAPP" : "RECRUTADOR";
    const em = new Date(criada.getTime() + (fonte === "PORTAL" ? 0 : 2 * 3600_000)).toISOString();
    const respostasFonte: CandidaturaDaDemo["respostasFonte"] = {};
    if (c.pretensao !== undefined) respostasFonte.pretensaoSalarial = { origem: fonte, em };
    if (c.disponibilidade !== undefined) respostasFonte.disponibilidade = { origem: fonte, em };
    if (c.deslocamento !== undefined) respostasFonte.deslocamentoMinutos = { origem: fonte, em };
    return {
      chave: `${c.vaga}:${c.pessoa}`,
      vaga: c.vaga,
      pessoa: c.pessoa,
      origin: c.origin,
      stage: c.stage,
      status,
      rejectionReason: status === "REPROVADO" ? (c.motivo ?? null) : null,
      withdrawalReason: status === "DESISTENTE" ? (c.motivo ?? null) : null,
      hiredAt: c.contratadaEm === undefined ? null : instante(c.contratadaEm, 16, 10),
      createdAt: criada,
      pretensaoSalarial: c.pretensao ?? null,
      disponibilidade: c.disponibilidade ?? null,
      deslocamentoMinutos: c.deslocamento ?? null,
      respostasFonte: Object.keys(respostasFonte).length > 0 ? respostasFonte : null,
      notas,
    };
  });
  const candidaturaPorChave = new Map(candidaturas.map((c) => [c.chave, c]));

  const entrevistas: EntrevistaDaDemo[] = ENTREVISTAS.map(({ vaga, pessoa, dia, ...e }) => {
    const c = candidaturaPorChave.get(`${vaga}:${pessoa}`)!;
    return { ...e, candidatura: c.chave, stage: "ENTREVISTA", createdAt: instante(dia, 15, 30) };
  });

  const testes: TesteDaDemo[] = TESTES.map((t) => {
    const c = candidaturaPorChave.get(`${t.vaga}:${t.pessoa}`)!;
    const createdAt = instante(t.criado, 10, 45);
    const respondido = t.respondido === undefined ? null : new Date(createdAt.getTime() + t.respondido * DIA_MS + 3 * 3600_000);
    return {
      chave: `${c.chave}:${t.type}`,
      pessoa: t.pessoa,
      candidatura: c.chave,
      type: t.type,
      status: respondido ? "RESPONDIDO" : "PENDENTE",
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 7 * DIA_MS),
      submittedAt: respondido,
      disc: respondido && t.type === "DISC" ? discRespondido(PERFIS_DISC[t.perfil!]!.mais, PERFIS_DISC[t.perfil!]!.menos) : null,
      escolhas: respondido && t.type === "MULTIPLA_ESCOLHA" ? escolhasComErros(t.erradas ?? []) : null,
    };
  });

  return {
    hoje,
    empresas: EMPRESAS.map((e) => ({ ...e })),
    cargos: CARGOS.map((c) => ({ ...c })),
    etiquetas: ETIQUETAS.map((e) => ({ ...e })),
    pessoas,
    vagas,
    candidaturas,
    entrevistas,
    questionario: { ...QUESTIONARIO, perguntas: QUESTIONARIO.perguntas.map((q) => ({ ...q, options: [...q.options] })) },
    testes,
  };
}

/** Os números da demonstração, para a simulação e o relatório. */
export function contagemDaDemonstracao(p: PlanoDaDemonstracao) {
  const candidatos = p.pessoas.filter((x) => x.type === "CANDIDATO");
  return {
    empresas: p.empresas.length,
    cargos: p.cargos.length,
    etiquetas: p.etiquetas.length,
    vagas: p.vagas.length,
    vagasNoPortal: p.vagas.filter((v) => v.isPublic && v.status === "ABERTA").length,
    versoesDeRequisitos: p.vagas.reduce((s, v) => s + v.requisitos.length, 0),
    candidatos: candidatos.length,
    colaboradores: p.pessoas.length - candidatos.length,
    candidaturas: p.candidaturas.length,
    notas: p.candidaturas.reduce((s, c) => s + c.notas.length, 0),
    entrevistas: p.entrevistas.length,
    perguntas: p.questionario.perguntas.length,
    testes: p.testes.length,
    testesRespondidos: p.testes.filter((t) => t.status === "RESPONDIDO").length,
  };
}
