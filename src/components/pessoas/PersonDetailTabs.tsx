"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Building2, Briefcase, FileText, History, MessageCircle } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

type Props = {
  overview: React.ReactNode;
  vinculo: React.ReactNode;
  trabalhista: React.ReactNode;
  documents: React.ReactNode;
  documentsCount: number;
  history: React.ReactNode;
  conversations: React.ReactNode;
  conversationsCount: number;
};

// Mesmo padrão visual/estrutural do CompanyDetailTabs — reduz a poluição visual
// do detalhe de pessoa distribuindo as seções em abas em vez de empilhar tudo.
export function PersonDetailTabs({
  overview,
  vinculo,
  trabalhista,
  documents,
  documentsCount,
  history,
  conversations,
  conversationsCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const validTabs = ["overview", "vinculo", "trabalhista", "documents", "conversations", "history"];
  const tabFromUrl = searchParams.get("tab");
  const [active, setActive] = useState(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "overview"
  );

  const tabs = [
    { key: "overview", label: "Visão Geral", icon: <LayoutGrid /> },
    { key: "vinculo", label: "Vínculo", icon: <Building2 /> },
    { key: "trabalhista", label: "Dados Trabalhistas", icon: <Briefcase /> },
    { key: "documents", label: `Documentos${documentsCount ? ` (${documentsCount})` : ""}`, icon: <FileText /> },
    { key: "conversations", label: `Conversas${conversationsCount ? ` (${conversationsCount})` : ""}`, icon: <MessageCircle /> },
    { key: "history", label: "Histórico", icon: <History /> },
  ];

  function handleChange(key: string) {
    setActive(key);
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  return (
    <div>
      <Tabs tabs={tabs} active={active} onChange={handleChange} className="mb-5" />
      <div>
        {active === "overview" && overview}
        {active === "vinculo" && vinculo}
        {active === "trabalhista" && trabalhista}
        {active === "documents" && documents}
        {active === "conversations" && conversations}
        {active === "history" && history}
      </div>
    </div>
  );
}
