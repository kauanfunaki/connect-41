import Link from "next/link";
import { PipelineForm } from "@/components/pipelines/PipelineForm";
import { criarPipeline } from "../actions";

export default function NovoPipelinePage() {
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pipelines" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pipelines
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo Pipeline</span>
      </div>

      <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">Novo Pipeline</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <PipelineForm action={criarPipeline} />
      </div>
    </div>
  );
}
