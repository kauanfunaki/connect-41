"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { LayoutGrid, Users, Briefcase, FileText, History, MessageCircle } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

type Props = {
  overview: React.ReactNode;
  people: React.ReactNode;
  peopleCount: number;
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
  const validTabs = ["overview", "people", "operations", "documents", "conversations", "history"];
  const tabFromUrl = searchParams.get("tab");
  const [active, setActive] = useState(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "overview"
  );

  const tabs = [
    { key: "overview", label: "Visão Geral", icon: <LayoutGrid /> },
    { key: "people", label: `Pessoas${peopleCount ? ` (${peopleCount})` : ""}`, icon: <Users /> },
    { key: "operations", label: "RH & Operação", icon: <Briefcase /> },
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
        {active === "people" && people}
        {active === "operations" && operations}
        {active === "documents" && documents}
        {active === "conversations" && conversations}
        {active === "history" && history}
      </div>
    </div>
  );
}
