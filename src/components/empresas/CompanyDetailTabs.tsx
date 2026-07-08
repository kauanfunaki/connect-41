"use client";

import { useState } from "react";
import { LayoutGrid, Users, Briefcase, FileText, History } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

type Props = {
  overview: React.ReactNode;
  people: React.ReactNode;
  peopleCount: number;
  operations: React.ReactNode;
  documents: React.ReactNode;
  documentsCount: number;
  history: React.ReactNode;
};

export function CompanyDetailTabs({
  overview,
  people,
  peopleCount,
  operations,
  documents,
  documentsCount,
  history,
}: Props) {
  const [active, setActive] = useState("overview");

  const tabs = [
    { key: "overview", label: "Visão Geral", icon: <LayoutGrid /> },
    { key: "people", label: `Pessoas${peopleCount ? ` (${peopleCount})` : ""}`, icon: <Users /> },
    { key: "operations", label: "RH & Operação", icon: <Briefcase /> },
    { key: "documents", label: `Documentos${documentsCount ? ` (${documentsCount})` : ""}`, icon: <FileText /> },
    { key: "history", label: "Histórico", icon: <History /> },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={active} onChange={setActive} className="mb-5" />
      <div>
        {active === "overview" && overview}
        {active === "people" && people}
        {active === "operations" && operations}
        {active === "documents" && documents}
        {active === "history" && history}
      </div>
    </div>
  );
}
