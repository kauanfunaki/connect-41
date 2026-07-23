export type CadastrosTab = "empresas" | "pessoas";

// Chave de localStorage usada para lembrar a última aba de Cadastros
// (Empresas/Pessoas) visitada pelo usuário — lida pelo item "Cadastros"
// da sidebar e escrita pelas rotas /empresas/* e /pessoas/*.
export const CADASTROS_LAST_TAB_KEY = "connect41:cadastros:lastTab";
