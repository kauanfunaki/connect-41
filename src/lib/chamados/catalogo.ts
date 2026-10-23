export const CATALOGO_DE_CHAMADOS = {
  Desenvolvimento: ["Ajuste | Criação de Relatório", "Banco de Dados", "Bug | Correção", "Deploy | Publicação", "Integrações de Sistemas", "Manutenção", "Nova Automação", "Nova Funcionalidade", "Nova Plataforma | Sistema Interno", "Novo Dashboard | BI"],
  Infraestrutura: ["Acesso | Senhas", "Backup | Armazenamento", "E-mail | Comunicação", "Hardware | Periféricos", "Instalação de Software", "Problema de Rede | Internet", "VPN | Conectividade"],
  Suporte: ["Dúvida | Orientação", "Estações de Trabalho", "Integração de Colaboradores", "Relatórios", "Sistemas Externos", "Sistema Travando | Erro", "Treinamento"],
} as const;
export const A_CLASSIFICAR = "A classificar";
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
