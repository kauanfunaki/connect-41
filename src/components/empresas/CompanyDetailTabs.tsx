"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Users, Briefcase, FileText, History, MessageCircle, Network } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

type Props = {
  overview: React.ReactNode;
  people: React.ReactNode;
  peopleCount: number;
  filiais: React.ReactNode;
  filiaisCount: number;
  operations: React.ReactNode;
  documents: React.ReactNode;
  documentsCount: number;
  history: React.ReactNode;
  conversations: React.ReactNode;
  conversationsCount: number;
};

export function CompanyDetailTabs({
  overview,
  people,
  peopleCount,
  filiais,
  filiaisCount,
  operations,
  documents,
  documentsCount,
  history,
  conversations,
  conversationsCount,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const validTabs = ["overview", "filiais", "people", "operations", "documents", "conversations", "history"];
  const tabFromUrl = searchParams.get("tab");
  const [active, setActive] = useState(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "overview"
  );

  const tabs = [
    { key: "overview", label: "Visão geral", icon: <LayoutGrid /> },
    { key: "filiais", label: `Filiais${filiaisCount ? ` (${filiaisCount})` : ""}`, icon: <Network /> },
    { key: "people", label: `Pessoas${peopleCount ? ` (${peopleCount})` : ""}`, icon: <Users /> },
    { key: "operations", label: "RH & operação", icon: <Briefcase /> },
    { key: "documents", label: `Documentos${documentsCount ? ` (${documentsCount})` : ""}`, icon: <FileText /> },
    { key: "conversations", label: `Conversas${conversationsCount ? ` (${conversationsCount})` : ""}`, icon: <MessageCircle /> },
    { key: "history", label: "Histórico", icon: <History /> },
  ];

  // Aba de verdade, e não aba que navega (07/10/2026): os painéis já vêm
  // prontos do servidor e a troca é na hora, no cliente; a URL só guarda a aba
  // (`router.replace`) para o "Voltar" e o link copiado. Por isso fica o `Tabs`
  // (role="tab"), agora apontando para o painel (`tabpanel`), e não o
  // `AbasDeLink` — com ele cada clique esperaria o servidor refazer a ficha.
  function handleChange(key: string) {
    setActive(key);
    router.replace(`${pathname}?tab=${key}`, { scroll: false });
  }

  return (
    <div>
      <Tabs tabs={tabs.map((t) => ({ ...t, panelId: "painel-da-empresa" }))} active={active} onChange={handleChange} className="mb-5" />
      <div role="tabpanel" id="painel-da-empresa" aria-label={tabs.find((t) => t.key === active)?.label}>
        {active === "overview" && overview}
        {active === "filiais" && filiais}
        {active === "people" && people}
        {active === "operations" && operations}
        {active === "documents" && documents}
        {active === "conversations" && conversations}
        {active === "history" && history}
      </div>
    </div>
  );
}
