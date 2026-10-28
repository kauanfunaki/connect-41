// A cor por grupo de telas também no Connect da equipe (21/10/2026, pedido
// do Kauan): antes, a cor do setor ativo pintava todas as telas dele — no BPO,
// tudo laranja. Agora cada tela leva a cor do grupo dela, como no portal e no
// Omie: contas a pagar e a receber em azul, as notas em laranja. A cor do setor
// fica só para dizer qual é o setor (a bolinha no menu e a troca de setor).
//
// Os grupos são os do portal (`lib/aparencia/cores.ts`); as cores, as que o
// escritório escolheu em Aparência. Tela fora destes grupos fica na cor
// principal.
//
// 28/10/2026: os grupos viraram as sete **áreas de uso** (opção 1 da página
// "Cores do Connect da equipe", como no Omie). O menu continua por setor; a
// cor de cada item e da tela aberta é a da área. Entraram Pessoas (DP e os
// indicadores de RH), Recrutamento e Escritório (Tech, Gestão, Chamados).

import { MODULE_ROUTES } from "@/lib/module-catalog";
import { ehGrupoDeCor, type GrupoDeCor } from "./cores";

/** O grupo de cada módulo da equipe. O que não está aqui fica na cor principal. */
export const GRUPO_DO_MODULO: Readonly<Record<string, GrupoDeCor>> = {
  // Financeiro: o dinheiro do cliente e o que se lê dele.
  bpo_contas_pagar: "financeiro",
  bpo_contas_receber: "financeiro",
  bpo_lancamentos: "financeiro",
  bpo_fluxo_caixa: "financeiro",
  bpo_tabela_dinamica: "financeiro",
  bpo_conciliacao: "financeiro",
  bpo_cadastros: "financeiro",
  bpo_aprovacoes: "financeiro",
  bpo_cobranca: "financeiro",
  bpo_painel_carteira: "financeiro",
  bpo_dre: "financeiro",
  dre_economica: "financeiro",
  dre_analises: "financeiro",
  dre_orcamento: "financeiro",
  // Fiscal e notas: a emissão do BPO e as telas do Fiscal.
  bpo_emitir_nfse: "fiscal",
  fiscal_documentos: "fiscal",
  fiscal_autorizacoes: "fiscal",
  fiscal_painel: "fiscal",
  fiscal_classificacao: "fiscal",
  fiscal_operacao: "fiscal",
  fiscal_acervo: "fiscal",
  fiscal_icms_ipi: "fiscal",
  fiscal_contribuicoes: "fiscal",
  fiscal_entregas: "fiscal",
  fiscal_conferencia: "fiscal",
  fiscal_configuracoes: "fiscal",
  // Processos: o Societário.
  societario_processos: "processos",
  societario_licencas: "processos",
  societario_minha_area: "processos",
  societario_prazos: "processos",
  societario_relatorios: "processos",
  societario_certidoes: "processos",
  // Solicitações: a conversa com o cliente, de qualquer setor.
  bpo_pendencias: "atendimento",
  bpo_comunicacao: "atendimento",
  portal_solicitacoes: "atendimento",
  arquivos: "atendimento",
  controladoria_conversas: "atendimento",
  comercial_leads: "atendimento",
  // Pessoas: o ciclo do colaborador e o que se lê dele.
  dp_colaboradores: "pessoas",
  dp_afastamentos: "pessoas",
  dp_horas_extras: "pessoas",
  dp_escalas: "pessoas",
  dp_treinamentos: "pessoas",
  dp_avaliacoes: "pessoas",
  gestao_cargos_salarios: "pessoas",
  gestao_indicadores_rh: "pessoas",
  // Recrutamento.
  recrutamento_vagas: "recrutamento",
  recrutamento_candidatos: "recrutamento",
  recrutamento_testes: "recrutamento",
  recrutamento_whatsapp: "recrutamento",
  recrutamento_colaboradores_clientes: "recrutamento",
  // Escritório: o que é da casa, e não de um cliente.
  helpdesk: "escritorio",
  tech_controle_interno: "escritorio",
  tech_github_contributions: "escritorio",
  tech_ops_center: "escritorio",
  tech_certificados: "escritorio",
  gestao_painel: "escritorio",
  gestao_valora: "escritorio",
  contabil_sped: "escritorio",
};

/**
 * Endereços que não são o de um módulo no catálogo, mas são telas dele: o
 * endereço novo de Fornecedores e sacados e a emissão de nota pelo acervo.
 */
const ENDERECOS_EXTRAS: readonly [string, GrupoDeCor][] = [
  ["/fornecedores-e-sacados", "financeiro"],
  ["/documentos-fiscais", "fiscal"],
  // As telas do DP que saem de Colaboradores.
  ["/ferias", "pessoas"],
  ["/admissoes", "pessoas"],
  ["/desligamentos", "pessoas"],
];

const ROTAS: readonly [string, GrupoDeCor][] = [
  ...Object.entries(GRUPO_DO_MODULO).flatMap(([modulo, grupo]): [string, GrupoDeCor][] => {
    const rota = MODULE_ROUTES[modulo];
    return rota ? [[rota, grupo]] : [];
  }),
  ...ENDERECOS_EXTRAS,
]
  // O endereço mais comprido primeiro: `/dre/orcamento` antes de `/dre`.
  .sort((a, b) => b[0].length - a[0].length);

/** O grupo de cor da tela aberta no Connect da equipe; `null` fica na cor principal. */
export function grupoDaTelaDaEquipe(pathname: string): GrupoDeCor | null {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  // A página da própria área (28/10/2026): `/area/financeiro`.
  const daArea = /^\/area\/([^/]+)$/.exec(caminho)?.[1];
  if (daArea) return ehGrupoDeCor(daArea) ? daArea : null;
  const achada = ROTAS.find(([rota]) => caminho === rota || caminho.startsWith(`${rota}/`));
  return achada?.[1] ?? null;
}

/** A área de uso de um módulo; `null` fica na cor principal. */
export function areaDoModulo(code: string): GrupoDeCor | null {
  return GRUPO_DO_MODULO[code] ?? null;
}

/**
 * A área de um grupo de telas do menu (Contas, Cliente…): a que mais telas
 * dele têm; no empate, a da primeira. `null` quando nenhuma tem área.
 */
export function areaDoGrupoDeTelas(codigos: readonly string[]): GrupoDeCor | null {
  const contagem = new Map<GrupoDeCor, number>();
  for (const c of codigos) {
    const area = areaDoModulo(c);
    if (area) contagem.set(area, (contagem.get(area) ?? 0) + 1);
  }
  let melhor: GrupoDeCor | null = null;
  for (const [area, n] of contagem) if (!melhor || n > contagem.get(melhor)!) melhor = area;
  return melhor;
}
