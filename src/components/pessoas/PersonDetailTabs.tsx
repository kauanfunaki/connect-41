"use client";

import { useState } from "react";
import { LayoutGrid, Building2, Briefcase, FileText, History } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";

type Props = {
  overview: React.ReactNode;
  vinculo: React.ReactNode;
  trabalhista: React.ReactNode;
  documents: React.ReactNode;
  documentsCount: number;
  history: React.ReactNode;
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
}: Props) {
  const [active, setActive] = useState("overview");

  const tabs = [
    { key: "overview", label: "Visão Geral", icon: <LayoutGrid /> },
    { key: "vinculo", label: "Vínculo", icon: <Building2 /> },
    { key: "trabalhista", label: "Dados Trabalhistas", icon: <Briefcase /> },
    { key: "documents", label: `Documentos${documentsCount ? ` (${documentsCount})` : ""}`, icon: <FileText /> },
    { key: "history", label: "Histórico", icon: <History /> },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={active} onChange={setActive} className="mb-5" />
      <div>
        {active === "overview" && overview}
        {active === "vinculo" && vinculo}
        {active === "trabalhista" && trabalhista}
        {active === "documents" && documents}
        {active === "history" && history}
      </div>
    </div>
  );
}
