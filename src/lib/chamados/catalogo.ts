export const CATALOGO_DE_CHAMADOS = {
  Desenvolvimento: ["Ajuste | Criação de Relatório", "Banco de Dados", "Bug | Correção", "Deploy | Publicação", "Integrações de Sistemas", "Manutenção", "Nova Automação", "Nova Funcionalidade", "Nova Plataforma | Sistema Interno", "Novo Dashboard | BI"],
  Infraestrutura: ["Acesso | Senhas", "Backup | Armazenamento", "Certificado Digital | Assinadores", "E-mail | Comunicação", "Hardware | Periféricos", "Instalação de Software", "Problema de Rede | Internet", "VPN | Conectividade"],
  Suporte: ["Acessórias | E-mails e Tarefas", "Dúvida | Orientação", "Estações de Trabalho", "Integração de Colaboradores", "Relatórios", "Sistema Domínio", "Sistemas Externos", "Sistema Travando | Erro", "Treinamento"],
} as const;
export const A_CLASSIFICAR = "A classificar";

/**
 * O que a IA precisa saber das categorias que nasceram do histórico do Hub
 * (17/11/2026, melhoria-766): os três assuntos que se espalhavam por várias.
 * Vai no texto da triagem, da revisão e da leitura do histórico.
 */
export const DICAS_DAS_CATEGORIAS = [
  "Domínio, no chamado, quase sempre é o sistema contábil Domínio, e não nome de domínio de internet: atualizar, travar, lentidão, acesso, cadastro ou exclusão de empresa e base nova no Domínio vão em \"Sistema Domínio\".",
  "Certificado digital (A1, A3, e-CPF, e-CNPJ), assinadores (Serpro, Junta Comercial) e site que pede certificado vão em \"Certificado Digital | Assinadores\".",
  "Acessórias é o sistema de tarefas e envio a clientes: incluir, trocar ou tirar e-mail de empresa e criar tarefas nele vão em \"Acessórias | E-mails e Tarefas\"; problema na caixa de e-mail de alguém continua em \"E-mail | Comunicação\".",
].join("\n");
export type CategoriaNaArvore = { id: string; name: string; parentId: string | null; active?: boolean };

export function caminhoDaCategoria(categorias: CategoriaNaArvore[], id: string): string {
  const partes: string[] = [], vistos = new Set<string>();
  let atual = categorias.find(c => c.id === id);
  while (atual && !vistos.has(atual.id)) {
    vistos.add(atual.id); partes.unshift(atual.name);
    atual = categorias.find(c => c.id === atual!.parentId);
  }
  return partes.join(" › ");
}
export function categoriasClassificaveis<T extends CategoriaNaArvore>(categorias: T[]): T[] {
  const porId = new Map(categorias.map(c => [c.id, c]));
  return categorias.filter(c => {
    if (!c.active || c.name === A_CLASSIFICAR || categorias.some(f => f.parentId === c.id)) return false;
    const vistos = new Set([c.id]); let pai = c.parentId;
    while (pai) {
      const p = porId.get(pai);
      if (!p?.active || vistos.has(pai)) return false;
      vistos.add(pai); pai = p.parentId;
    }
    return true;
  });
}
