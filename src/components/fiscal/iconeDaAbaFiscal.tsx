import {
  ArrowLeftRight,
  Building,
  Calculator,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  Gavel,
  History,
  Landmark,
  ListChecks,
  Lock,
  Package,
  Play,
  Radar,
  Receipt,
  Scale,
  Settings2,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";

// O ícone de cada aba do Fiscal (29/10/2026, abas com ícone em todas as telas).
// As abas do SPED nascem de listas — o menu de telas (`menuSped`, pelo rótulo),
// as seções do motor e da prévia (pela chave) —, então o ícone mora num lugar
// só, e a mesma aba tem o mesmo ícone na prévia e no motor.
const PELA_CHAVE: Record<string, ReactNode> = {
  acervo: <FolderOpen />,
  envio: <Upload />,
  importacoes: <FileUp />,
  cobertura: <Radar />,
  produtos: <Package />,
  apoio: <FileText />,
  decisoes: <Gavel />,
  apuracao: <Calculator />,
  demonstrativo: <FileSpreadsheet />,
  ajustes: <SlidersHorizontal />,
  "dcip-dime": <Landmark />,
  fechamento: <Lock />,
  parametros: <Settings2 />,
  sped: <FileCheck2 />,
  previa: <Receipt />,
  confronto: <ArrowLeftRight />,
  arquivos: <FileCheck2 />,
  entregas: <FileUp />,
  executar: <Play />,
  historico: <History />,
};

const PELO_ROTULO: Record<string, ReactNode> = {
  Classificação: <ListChecks />,
  Apuração: <Calculator />,
  Empresas: <Building />,
  "De-Para CFOP": <ArrowLeftRight />,
  Regras: <Scale />,
  "DCIP e DIME": <Landmark />,
  "ICMS/IPI": <Calculator />,
  "PIS e COFINS": <Receipt />,
};

/** Pela chave da seção; sem par, pelo rótulo; sem nenhum, o de documento. */
export function iconeDaAbaFiscal(chave: string, rotulo?: string): ReactNode {
  return PELA_CHAVE[chave] ?? (rotulo !== undefined ? PELO_ROTULO[rotulo] : undefined) ?? PELO_ROTULO[chave] ?? <FileText />;
}
