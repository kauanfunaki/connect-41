// As telas de configuração do Connect, agrupadas em áreas — o menu lateral das
// configurações, a página inicial (/admin) e a trilha "Configurações › área"
// leem daqui.
//
// Escolha do Kauan em 14/10/2026 (página de alternativas, "Organização · A"):
// a engrenagem abre "Configurações", com seis áreas por assunto e um menu à
// esquerda em todas as telas de configuração — antes eram até 22 cartões do
// mesmo tamanho e nenhuma tela tinha caminho para a próxima. Nenhuma tela mudou
// de endereço: a área é só o agrupamento.
//
// Quem abre cada tela é a mesma regra que a própria tela confere no servidor
// (`notFound()` no topo de cada page.tsx). O menu não pode oferecer o que não
// abre — o gestor de setor via o cartão "Plano de contas" e dava 404 (achado do
// levantamento de 14/10).
//
// Puro, sem banco: roda no layout (servidor) e no menu (navegador).

import type { UserRole } from "@/generated/prisma/enums";

/**
 * Quem abre a tela, pela regra da própria página:
 * - `admin`: Administrador e Super Admin (`isFullWrite`);
 * - `gestorDeCampos`: os dois, mais o gestor de setor que tem setor (campos e tags);
 * - `gestorDeReunioes`: os dois, mais todo gestor de setor (`canManageMeetings`);
 * - `autoatendimento`: o Administrador de escritório em autoatendimento (não o Super Admin);
 * - `superAdmin`: só a 41 Tech.
 */
export type AcessoDaTela = "admin" | "gestorDeCampos" | "gestorDeReunioes" | "autoatendimento" | "superAdmin";

export type TelaDeConfiguracao = {
  chave: string;
  rotulo: string;
  /** Uma frase do que a tela faz — vai no cartão da página inicial. */
  descricao: string;
  /** A frase para o gestor de setor, quando ele vê só parte da tela. */
  descricaoDoGestor?: string;
  /** Para onde o item leva. */
  href: string;
  /**
   * O endereço que acende o item no menu e dá a área da trilha — vale também
   * para as telas de dentro (`/admin/usuarios/novo`). Sem `rota`, o item é um
   * atalho para um trecho de outra tela (o "Horário da Agenda" mora na tela
   * Empresa) e não acende sozinho.
   */
  rota?: string;
  /** A aba (`?aba=`) que distingue duas telas na mesma rota — o Portal tem Acessos e Telas liberadas. */
  aba?: string;
  acesso: AcessoDaTela;
};

export type ChaveDaArea = "escritorio" | "pessoas" | "setores" | "portal" | "rotinas" | "integracoes" | "plataforma";

export type AreaDeConfiguracao = {
  chave: ChaveDaArea;
  rotulo: string;
  resumo: string;
  /** Nome do ícone (o menu, de navegador, troca pelo desenho — ver `IconeDaArea`). */
  icone: "predio" | "pessoas" | "camadas" | "globo" | "repetir" | "brilho" | "cartao";
  /** Só a 41 Tech vê — fica separada no menu e na página inicial. */
  soDaPlataforma?: boolean;
  telas: TelaDeConfiguracao[];
};

export const AREAS: readonly AreaDeConfiguracao[] = [
  {
    chave: "escritorio",
    rotulo: "Escritório e assinatura",
    resumo: "Os dados do escritório e o plano.",
    icone: "predio",
    telas: [
      {
        chave: "tenant",
        rotulo: "Dados e e-mail de envio",
        descricao: "Nome e CNPJ do escritório e o e-mail que envia documentos aos clientes.",
        href: "/admin/tenant",
        rota: "/admin/tenant",
        acesso: "admin",
      },
      {
        chave: "agenda",
        rotulo: "Horário da Agenda",
        descricao: "As horas que a Agenda mostra para todo o escritório.",
        href: "/admin/tenant#horario-da-agenda",
        acesso: "admin",
      },
      {
        chave: "assinatura",
        rotulo: "Minha assinatura",
        descricao: "Plano contratado, usuários em uso e o limite do plano.",
        href: "/assinatura",
        rota: "/assinatura",
        acesso: "autoatendimento",
      },
    ],
  },
  {
    chave: "pessoas",
    rotulo: "Pessoas e acessos",
    resumo: "Quem entra e o que cada um vê.",
    icone: "pessoas",
    telas: [
      {
        chave: "usuarios",
        rotulo: "Usuários",
        descricao: "Contas, papéis e setores de cada pessoa da equipe.",
        href: "/admin/usuarios",
        rota: "/admin/usuarios",
        acesso: "admin",
      },
      {
        chave: "atendentes",
        rotulo: "Atendentes e vínculos",
        descricao: "Liga cada colaborador à conta dele e ao atendente do Chatwoot, e marca quem é da recepção.",
        href: "/admin/atendentes",
        rota: "/admin/atendentes",
        acesso: "admin",
      },
      {
        chave: "sensiveis",
        rotulo: "Campos sensíveis",
        descricao: "Quem vê salário, dados bancários, dados médicos e documentos pessoais.",
        href: "/admin/permissoes-sensiveis",
        rota: "/admin/permissoes-sensiveis",
        acesso: "admin",
      },
    ],
  },
  {
    chave: "setores",
    rotulo: "Setores e módulos",
    resumo: "Como o trabalho é dividido.",
    icone: "camadas",
    telas: [
      {
        chave: "setores",
        rotulo: "Setores e menu Geral",
        descricao: "Os setores, a cor de cada um e as telas do menu Geral de cada setor.",
        href: "/admin/setores",
        rota: "/admin/setores",
        acesso: "admin",
      },
      {
        chave: "modulos",
        rotulo: "Módulos",
        descricao: "Liga e desliga os módulos de cada setor.",
        href: "/admin/modulos",
        rota: "/admin/modulos",
        acesso: "admin",
      },
      {
        chave: "campos",
        rotulo: "Campos customizados",
        descricao: "Campos extras por setor e por tipo de cadastro.",
        href: "/admin/campos",
        rota: "/admin/campos",
        acesso: "gestorDeCampos",
      },
      {
        chave: "tags",
        rotulo: "Tags",
        descricao: "As etiquetas coloridas do Kanban.",
        href: "/admin/tags",
        rota: "/admin/tags",
        acesso: "gestorDeCampos",
      },
    ],
  },
  {
    chave: "portal",
    rotulo: "Portal do cliente",
    resumo: "O que o cliente vê e pede.",
    icone: "globo",
    telas: [
      {
        chave: "portal-acessos",
        rotulo: "Acessos ao portal",
        descricao: "Quem do cliente entra no portal e de qual cliente é.",
        href: "/admin/portal",
        rota: "/admin/portal",
        acesso: "admin",
      },
      {
        chave: "portal-telas",
        rotulo: "Telas liberadas",
        descricao: "As telas do portal que os clientes já podem abrir.",
        href: "/admin/portal?aba=telas",
        rota: "/admin/portal",
        aba: "telas",
        acesso: "admin",
      },
      {
        chave: "assuntos",
        rotulo: "Assuntos das solicitações",
        descricao: "O que o cliente escolhe ao pedir algo pelo portal, o setor que atende e o prazo.",
        href: "/admin/assuntos",
        rota: "/admin/assuntos",
        acesso: "admin",
      },
      {
        chave: "pastas",
        rotulo: "Modelo de pastas",
        descricao: "As pastas que toda empresa ganha nos Arquivos, com o setor de cada uma.",
        href: "/admin/arquivos",
        rota: "/admin/arquivos",
        acesso: "admin",
      },
    ],
  },
  {
    chave: "rotinas",
    rotulo: "Rotinas e cálculos",
    resumo: "Listas e regras que os módulos usam.",
    icone: "repetir",
    telas: [
      {
        chave: "obrigacoes",
        rotulo: "Obrigações recorrentes",
        descricao: "DAS, DCTF, folha e afins: itens do Kanban criados todo mês para cada empresa.",
        href: "/admin/obrigacoes",
        rota: "/admin/obrigacoes",
        acesso: "admin",
      },
      {
        chave: "feriados",
        rotulo: "Feriados",
        descricao: "Os feriados usados na Escala de trabalho.",
        href: "/admin/feriados",
        rota: "/admin/feriados",
        acesso: "admin",
      },
      {
        chave: "plano-de-contas",
        rotulo: "Plano de contas",
        descricao: "As categorias que classificam os lançamentos dos documentos fiscais.",
        href: "/admin/plano-de-contas",
        rota: "/admin/plano-de-contas",
        acesso: "admin",
      },
      {
        chave: "rescisao",
        rotulo: "Cálculo de rescisão",
        descricao: "O padrão do escritório para conferir o TRCT. Cada empresa pode ter o seu.",
        href: "/admin/rescisao",
        rota: "/admin/rescisao",
        acesso: "admin",
      },
      {
        chave: "competencias",
        rotulo: "Competências",
        descricao: "A lista usada nas avaliações de desempenho.",
        href: "/admin/competencias",
        rota: "/admin/competencias",
        acesso: "admin",
      },
    ],
  },
  {
    chave: "integracoes",
    rotulo: "Integrações e IA",
    resumo: "Sistemas ligados ao Connect.",
    icone: "brilho",
    telas: [
      {
        chave: "integracoes",
        rotulo: "Integrações",
        // O cartão dizia só "Google Meet / Microsoft Teams" (achado de 14/10);
        // a tela tem Serpro, Omie, Chatwoot, IA e a conta das reuniões.
        descricao: "Serpro, Omie, Chatwoot, a chave da IA e a conta Google ou Microsoft das reuniões.",
        descricaoDoGestor: "A conta Google ou Microsoft usada nas reuniões.",
        href: "/admin/integracoes",
        rota: "/admin/integracoes",
        acesso: "gestorDeReunioes",
      },
      {
        chave: "ia",
        rotulo: "Inteligência artificial",
        descricao: "Os agentes do chat: o que fizeram no mês, quanto custou e os limites.",
        href: "/admin/ia",
        rota: "/admin/ia",
        acesso: "admin",
      },
    ],
  },
  {
    chave: "plataforma",
    rotulo: "Clientes e planos",
    resumo: "Só a 41 Tech vê.",
    icone: "cartao",
    soDaPlataforma: true,
    telas: [
      {
        chave: "workspaces",
        // "Workspaces", como o título da tela: "Clientes" já é o cadastro de
        // clientes de cada escritório (Cadastros › Clientes).
        rotulo: "Workspaces",
        descricao: "Os escritórios clientes do Connect, a foto de cada um e o acesso do suporte.",
        href: "/admin/workspaces",
        rota: "/admin/workspaces",
        acesso: "superAdmin",
      },
      {
        chave: "assinaturas",
        rotulo: "Assinaturas",
        descricao: "Plano, situação, limite de usuários e renovação de cada cliente.",
        href: "/admin/assinaturas",
        rota: "/admin/assinaturas",
        acesso: "superAdmin",
      },
      {
        chave: "planos",
        rotulo: "Planos",
        descricao: "O catálogo comercial: cobrança, valor, implantação e módulos.",
        href: "/admin/planos",
        rota: "/admin/planos",
        acesso: "superAdmin",
      },
      {
        chave: "auditoria",
        rotulo: "Auditoria",
        descricao: "Quem fez o quê no escritório aberto, dia a dia.",
        href: "/admin/auditoria",
        rota: "/admin/auditoria",
        acesso: "superAdmin",
      },
    ],
  },
];

/** A conta da própria pessoa — fica fora das áreas, no pé do menu. */
export const SUA_CONTA = { rotulo: "Sua conta", href: "/configuracoes", rota: "/configuracoes" } as const;

/** O início das configurações — o painel com um cartão por área. */
export const INICIO_DAS_CONFIGURACOES = "/admin";

/** O que as regras de acesso leem de quem pede. */
export type QuemConfigura = {
  role: UserRole;
  /** Quantos setores a pessoa tem (o gestor sem setor não mexe em campos e tags). */
  setores: number;
  /** O escritório aberto é de autoatendimento (tem "Minha assinatura"). */
  autoatendimento: boolean;
};

function ehAdmin(role: UserRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/** A mesma regra que a tela confere no servidor — ver `AcessoDaTela`. */
export function podeAbrirTela(tela: Pick<TelaDeConfiguracao, "acesso">, quem: QuemConfigura): boolean {
  switch (tela.acesso) {
    case "admin":
      return ehAdmin(quem.role);
    case "gestorDeCampos":
      return ehAdmin(quem.role) || (quem.role === "SECTOR_ADMIN" && quem.setores > 0);
    case "gestorDeReunioes":
      return ehAdmin(quem.role) || quem.role === "SECTOR_ADMIN";
    case "autoatendimento":
      return quem.role === "ADMIN" && quem.autoatendimento;
    case "superAdmin":
      return quem.role === "SUPER_ADMIN";
  }
}

/** Abre o início das configurações (/admin) — a regra da página e do layout do app. */
export function podeAbrirInicio(quem: QuemConfigura): boolean {
  return ehAdmin(quem.role) || (quem.role === "SECTOR_ADMIN" && quem.setores > 0);
}

/** As áreas como a pessoa as vê: só as telas que ela abre, e só as áreas com alguma tela. */
export function areasVisiveis(quem: QuemConfigura): AreaDeConfiguracao[] {
  return AREAS.map((a) => ({
    ...a,
    telas: a.telas
      .filter((t) => podeAbrirTela(t, quem))
      .map((t) => (t.descricaoDoGestor && !ehAdmin(quem.role) ? { ...t, descricao: t.descricaoDoGestor } : t)),
  })).filter((a) => a.telas.length > 0);
}

export type MenuDasConfiguracoes = {
  /** Mostra "Visão geral" (o início, /admin). */
  inicio: boolean;
  areas: AreaDeConfiguracao[];
};

/**
 * O menu lateral. `null` quando não há o que configurar além da própria conta
 * — o colaborador e o Somente leitura seguem só com "Configurações" (a conta),
 * sem menu.
 */
export function menuDasConfiguracoes(quem: QuemConfigura): MenuDasConfiguracoes | null {
  const areas = areasVisiveis(quem);
  if (areas.length === 0) return null;
  return { inicio: podeAbrirInicio(quem), areas };
}

function bateNaRota(pathname: string, rota: string): boolean {
  return pathname === rota || pathname.startsWith(`${rota}/`);
}

export type LocalNasConfiguracoes = {
  area: AreaDeConfiguracao;
  tela: TelaDeConfiguracao;
  /** Uma tela de dentro (novo, editar, ficha) — a trilha ganha o nome da tela, com link. */
  dentro: boolean;
};

/**
 * Em que área e tela um endereço cai. A rota mais longa ganha; na mesma rota,
 * a aba decide (o Portal tem duas telas em /admin/portal). `null` para o
 * início (/admin), a conta e endereço fora das configurações.
 */
export function localDaRota(
  pathname: string,
  aba?: string | null,
  areas: readonly AreaDeConfiguracao[] = AREAS
): LocalNasConfiguracoes | null {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  let achado: LocalNasConfiguracoes | null = null;
  let tamanho = -1;
  for (const area of areas) {
    for (const tela of area.telas) {
      if (!tela.rota || !bateNaRota(caminho, tela.rota)) continue;
      const abaBate = tela.aba ? tela.aba === aba : true;
      // A tela com aba só ganha quando a aba bate; a sem aba é a padrão da rota.
      const peso = tela.rota.length * 2 + (tela.aba && abaBate ? 1 : 0);
      if (!abaBate) continue;
      if (peso > tamanho) {
        tamanho = peso;
        achado = { area, tela, dentro: caminho !== tela.rota };
      }
    }
  }
  return achado;
}

export type ItemDaTrilha = { rotulo: string; href?: string };

/** O endereço do cartão da área na página inicial. */
export function hrefDaArea(chave: ChaveDaArea): string {
  return `${INICIO_DAS_CONFIGURACOES}#area-${chave}`;
}

/**
 * A trilha do topo das telas de configuração: "Configurações › área" e, numa
 * tela de dentro, "› tela". Vazia no início. O "Configurações" só é link para
 * quem abre o início; a área, idem (o link é o cartão dela no início).
 */
export function trilhaDasConfiguracoes(
  pathname: string,
  aba: string | null | undefined,
  quem: QuemConfigura
): ItemDaTrilha[] {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  if (caminho === INICIO_DAS_CONFIGURACOES) return [];
  const inicio = podeAbrirInicio(quem);
  const raiz: ItemDaTrilha = { rotulo: "Configurações", href: inicio ? INICIO_DAS_CONFIGURACOES : undefined };
  if (bateNaRota(caminho, SUA_CONTA.rota)) return [raiz, { rotulo: SUA_CONTA.rotulo }];
  const local = localDaRota(caminho, aba);
  if (!local) return [];
  const itens: ItemDaTrilha[] = [raiz, { rotulo: local.area.rotulo, href: inicio ? hrefDaArea(local.area.chave) : undefined }];
  if (local.dentro) itens.push({ rotulo: local.tela.rotulo, href: local.tela.href });
  return itens;
}
