import { BookOpen } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { resumoDoContabilCore } from "@/lib/contabil-core/servidor/resumo";

export const dynamic = "force-dynamic";

// Contábil Core (Fase 1, 09/11/2026). O módulo nasce desligado e, até a virada
// do Bloco A, esta tela só diz em que pé está a migração: as telas de trabalho
// (Importações, Extrato, NEO, Classificação e Configurações) entram na Fase 2.
// O plano está em docs/CONTABIL-CORE.md.
export default async function ContabilCorePage() {
  const { ctx } = await abrirTelaDoModulo("contabil_core");
  const resumo = await resumoDoContabilCore(ctx.tenantId);

  return (
    <PageContainer>
      <PageHeader
        title="Contábil Core"
        subtitle="Extratos, regras, classificação pelo NEO e arquivo de importação do Domínio, trazidos do Contábil Core."
      />
      <Aviso tom="info">
        O Contábil Core está sendo trazido para o Connect por partes. Até a virada, continue usando o
        Contábil Core para importar extratos, classificar e exportar.
      </Aviso>
      {resumo.empresas === 0 ? (
        <EmptyState
          icon={<BookOpen size={28} aria-hidden />}
          title="Nenhuma empresa no Contábil Core ainda"
          description="As empresas, os planos de contas, as regras e os lançamentos chegam na carga dos dados, no dia da virada."
        />
      ) : (
        <p className="mt-4 text-sm text-fg-secondary">
          {resumo.empresas === 1 ? "1 empresa" : `${resumo.empresas} empresas`} no Contábil Core,{" "}
          {resumo.transacoes === 1 ? "1 transação" : `${resumo.transacoes} transações`} importadas.
        </p>
      )}
    </PageContainer>
  );
}
