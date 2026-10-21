export type CadastrosTab = "empresas" | "pessoas";

// Chave de localStorage usada para lembrar a última aba de Cadastros
// (Empresas/Pessoas) visitada pelo usuário — lida pelo item "Cadastros"
// da sidebar e escrita pelas rotas /empresas/* e /pessoas/*.
export const CADASTROS_LAST_TAB_KEY = "connect41:cadastros:lastTab";

// Fornecedores e sacados (21/10/2026): aba de Cadastros só para quem vê o BPO.
// Saiu do menu do BPO, onde repetia o "Cadastros" do menu geral. Não entra na
// última aba lembrada: o item "Cadastros" segue levando a Empresas ou Pessoas,
// que todos abrem.
export const CAMINHO_DOS_FORNECEDORES = "/fornecedores-e-sacados";
