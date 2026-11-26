import { BookOpen, CreditCard, FileCheck, FileText, Inbox, LayoutDashboard, Receipt, Scale, SlidersHorizontal, Tags, TrendingUp, Users, Zap } from "lucide-react";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Aviso } from "@/components/ui/Aviso";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { formatCnpj } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import { ehUuid, relatorioSchema } from "@/lib/contabil-core/entradas";
import { ABAS, mesAtual, ROTULO_DO_REGIME, type Aba } from "@/lib/contabil-core/tela";
import { empresasParaLigar, listarEmpresas, regimeDoCadastro } from "@/lib/contabil-core/servidor/cadastros";
import { LigarEmpresa } from "@/components/contabil-core/Formularios";
import { SeletorDeEmpresa } from "@/components/contabil-core/SeletorDeEmpresa";
import {
  AbaComprovantes,
  AbaCartoes,
  AbaConciliacao,
  AbaConfiguracoes,
  AbaContrapartes,
  AbaExtrato,
  AbaImportacoes,
  AbaNeo,
  AbaNotas,
  AbaPainel,
  AbaRegistros,
  AbaRegras,
  AbaRelatorios,
  type ContextoDaAba,
} from "@/components/contabil-core/Abas";

export const dynamic = "force-dynamic";

// Contábil Core (Fase 2, 09/11/2026): extratos, regras, NEO e arquivo do Domínio dentro do Connect.
// O módulo segue desligado até a virada do Bloco A (docs/CONTABIL-CORE.md); enquanto isso o time usa o
// Contábil Core, e esta tela serve para conferir o porte com dados de teste e com a carga ensaiada.

type Busca = { empresa?: string; aba?: string; mes?: string; agencia?: string; busca?: string; pagina?: string; status?: string; vista?: string; de?: string; ate?: string };

const ROTULO_DA_ABA: Record<Aba, { rotulo: string; icone: React.ReactNode }> = {
  painel: { rotulo: "Painel", icone: <LayoutDashboard size={16} aria-hidden /> },
  importacoes: { rotulo: "Importações", icone: <Inbox size={16} aria-hidden /> },
  extrato: { rotulo: "Extrato", icone: <FileText size={16} aria-hidden /> },
  neo: { rotulo: "NEO", icone: <Zap size={16} aria-hidden /> },
  regras: { rotulo: "Regras", icone: <Tags size={16} aria-hidden /> },
  contrapartes: { rotulo: "Contrapartes", icone: <Users size={16} aria-hidden /> },
  registros: { rotulo: "Registros", icone: <BookOpen size={16} aria-hidden /> },
  notas: { rotulo: "Notas", icone: <Receipt size={16} aria-hidden /> },
  comprovantes: { rotulo: "Comprovantes", icone: <FileCheck size={16} aria-hidden /> },
  cartoes: { rotulo: "Cartões", icone: <CreditCard size={16} aria-hidden /> },
  conciliacao: { rotulo: "Conciliação", icone: <Scale size={16} aria-hidden /> },
  relatorios: { rotulo: "Relatórios", icone: <TrendingUp size={16} aria-hidden /> },
  configuracoes: { rotulo: "Configurações", icone: <SlidersHorizontal size={16} aria-hidden /> },
};

export default async function ContabilCorePage({ searchParams }: { searchParams: Promise<Busca> }) {
  const { ctx } = await abrirTelaDoModulo("contabil_core");
  const q = await searchParams;
  const [podeAgir, podeGerir, empresas] = await Promise.all([
    podeNoModulo(ctx, "contabil_core", "agir"),
    podeNoModulo(ctx, "contabil_core", "gerir"),
    listarEmpresas(ctx.tenantId),
  ]);
  const paraLigar = podeGerir ? await empresasParaLigar(ctx.tenantId) : [];
  const ligar = podeGerir && paraLigar.length > 0 && (
    <LigarEmpresa
      empresas={paraLigar.map((e) => ({ value: e.id, label: nomeExibicao(e), descricao: formatCnpj(e.cnpj), regime: regimeDoCadastro(e.taxRegimeKind) }))}
    />
  );

  const aviso = (
    // Só a situação de agora; o "por partes" e os formatos do extrato estão no
    // artigo de ajuda (17/11/2026, melhoria-707). O "só OFX" já não valia: o
    // envio lê PDF e planilha também.
    <Aviso tom="info" className="mb-4">
      Até a virada, continue usando o Contábil Core para o trabalho do dia.
    </Aviso>
  );

  if (empresas.length === 0) {
    return (
      <PageContainer>
        <PageHeader title="Contábil Core" action={ligar || undefined} />
        {aviso}
        <EmptyState
          icon={<BookOpen size={28} aria-hidden />}
          title="Nenhuma empresa no Contábil Core"
          description="As empresas chegam com a carga dos dados no dia da virada."
        />
      </PageContainer>
    );
  }

  const empresa = empresas.find((e) => ehUuid(q.empresa) && e.id === q.empresa.toLowerCase()) ?? empresas[0];
  const aba: Aba = (ABAS as readonly string[]).includes(q.aba ?? "") ? (q.aba as Aba) : "painel";
  const mes = q.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) ? q.mes : null;
  const c: ContextoDaAba = {
    tenantId: ctx.tenantId,
    empresaId: empresa.id,
    podeAgir,
    podeGerir,
    mes,
    agenciaId: ehUuid(q.agencia) ? q.agencia.toLowerCase() : null,
    busca: q.busca?.trim().slice(0, 100) || null,
    pagina: Math.max(1, Number.parseInt(q.pagina ?? "1", 10) || 1),
    status: q.status ?? null,
    mesAtual: mesAtual(),
    vista: q.vista === "financeiro" || q.vista === "conflitos" || q.vista === "balancete" || q.vista === "livro-caixa" ? q.vista : null,
    // O período dos relatórios (Fase D2): cada ponta vale só se for uma data válida.
    de: relatorioSchema.safeParse({ de: q.de }).data?.de ?? null,
    ate: relatorioSchema.safeParse({ ate: q.ate }).data?.ate ?? null,
  };


  return (
    <PageContainer>
      <PageHeader
        title="Contábil Core"
        subtitle={`${nomeExibicao(empresa.company)} · ${formatCnpj(empresa.cnpj)} · ${ROTULO_DO_REGIME[empresa.regimeTributario] ?? empresa.regimeTributario}`}
        action={ligar || undefined}
      />
      {aviso}
      {empresas.length > 1 && (
        <div className="mb-4 max-w-md">
          <SeletorDeEmpresa
            empresas={empresas.map((e) => ({ value: e.id, label: nomeExibicao(e.company), descricao: formatCnpj(e.cnpj) }))}
            atual={empresa.id}
            aba={aba}
          />
        </div>
      )}
      <AbasDeLink
        aria-label="Áreas do Contábil Core"
        ativa={aba}
        abas={ABAS.map((a) => ({ chave: a, rotulo: ROTULO_DA_ABA[a].rotulo, icone: ROTULO_DA_ABA[a].icone, href: `/contabil-core?empresa=${empresa.id}&aba=${a}` }))}
      />
      {aba === "painel" && <AbaPainel c={c} />}
      {aba === "importacoes" && <AbaImportacoes c={c} />}
      {aba === "extrato" && <AbaExtrato c={c} />}
      {aba === "neo" && <AbaNeo c={c} />}
      {aba === "regras" && <AbaRegras c={c} />}
      {aba === "contrapartes" && <AbaContrapartes c={c} />}
      {aba === "registros" && <AbaRegistros c={c} />}
      {aba === "notas" && <AbaNotas c={c} />}
      {aba === "comprovantes" && <AbaComprovantes c={c} />}
      {aba === "cartoes" && <AbaCartoes c={c} />}
      {aba === "conciliacao" && <AbaConciliacao c={c} />}
      {aba === "relatorios" && <AbaRelatorios c={c} />}
      {aba === "configuracoes" && <AbaConfiguracoes c={c} />}
    </PageContainer>
  );
}
