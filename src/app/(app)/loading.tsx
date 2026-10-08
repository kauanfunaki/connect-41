import { ListPageSkeleton } from "@/components/shared/ListPageSkeleton";

// Rede de segurança do carregamento (07/10/2026): toda rota do app que não tem
// o próprio `loading.tsx` — eram oito do BPO (conciliação, pendências,
// aprovações, cobrança, lançamentos…) e Gestão, Leads e Valora — ficava com a
// tela anterior parada até a nova chegar, sem sinal de que o clique pegou.
//
// No Next 16 o `loading.tsx` de um segmento envolve o conteúdo dele e de tudo
// abaixo num `<Suspense>`; o de uma rota mais funda fica por dentro e vence
// para ela. As 43 rotas que já têm esqueleto próprio seguem com o delas. O
// formato aqui é o de listagem, o da maioria das telas.
export default function Loading() {
  return <ListPageSkeleton />;
}
