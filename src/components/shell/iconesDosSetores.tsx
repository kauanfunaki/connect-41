import {
  BriefcaseBusiness,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  FileSignature,
  LayoutGrid,
  ReceiptText,
  ShieldCheck,
  UserRoundCog,
  UserSearch,
  WalletCards,
} from "lucide-react";

// Ícone linear por setor (identidade visual; cor do setor continua vindo do dot).
// Fora do AppShell desde 30/10/2026: a janela de troca de setor mostra o mesmo
// ícone do menu e do cabeçalho, no lugar da bolinha de cor.
export const SECTOR_ICONS: Record<string, React.ReactNode> = {
  tech: <Columns3 size={16} />,
  dp: <UserRoundCog size={16} />,
  recrutamento: <UserSearch size={16} />,
  societario: <FileSignature size={16} />,
  financeiro: <WalletCards size={16} />,
  fiscal: <ReceiptText size={16} />,
  contabil: <Calculator size={16} />,
  bpo: <ClipboardList size={16} />,
  comercial: <BriefcaseBusiness size={16} />,
  corretora: <ShieldCheck size={16} />,
  gestao: <LayoutGrid size={16} />,
  controladoria: <ClipboardCheck size={16} />,
};
