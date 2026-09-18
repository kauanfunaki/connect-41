type Props = {
  children: React.ReactNode;
  className?: string;
};

// Wrapper de largura das telas internas e do portal: uma largura só, 1440px.
//
// Havia uma segunda, "narrow" (1000px), para formulários — e 61 telas a usavam.
// Centralizada, a troca de largura fazia o título e a borda do conteúdo pularem
// de lugar a cada navegação, e o DRE econômico ainda alternava entre as duas
// conforme o modo. O Kauan pediu o contrário em 18/09: o mesmo dimensionamento
// em todas as telas, para dar simetria. Formulário que precise de coluna mais
// estreita resolve dentro da tela, sem mexer na moldura.
export function PageContainer({ children, className = "" }: Props) {
  return <div className={`p-6 max-w-[1440px] mx-auto ${className}`.trim()}>{children}</div>;
}
