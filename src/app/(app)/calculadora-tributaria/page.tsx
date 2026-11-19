import { Calculator, PlugZap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CalculadoraDaReforma } from "@/components/tributario/calculadora/CalculadoraDaReforma";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { hojeIso } from "@/lib/datas/calendario";
import { MENSAGEM_DA_FALHA, ROTA_DA_CALCULADORA } from "@/lib/tributario/calculadora/regras";
import { dadosIniciaisDaCalculadora } from "@/lib/tributario/calculadora/calculadoraServidor";
import { consultarCalculadoraDaEquipe } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Calculadora da reforma (19/11/2026, funcionalidade-794): CBS, IBS e Imposto
 * Seletivo de uma operação, item a item, pelo cálculo oficial da Receita, que
 * roda como serviço interno (infra/calculadora-rtc). Para a equipe conferir
 * nota e orientar o cliente; o portal tem a versão de simulação.
 */
export default async function CalculadoraTributariaPage() {
  await abrirTelaDoModulo("fiscal_calculadora");
  const hoje = hojeIso();
  const iniciais = await dadosIniciaisDaCalculadora(hoje);

  return (
    <PageContainer>
      <PageHeader
        title="Calculadora da reforma"
        subtitle="CBS, IBS e Imposto Seletivo de uma operação, item a item, pelo cálculo oficial da Receita Federal."
      />
      {iniciais.ok ? (
        <CalculadoraDaReforma
          consultar={consultarCalculadoraDaEquipe}
          hoje={hoje}
          ufs={iniciais.dados.ufs}
          classificacoesIniciais={iniciais.dados.classificacoes}
          referenciasIniciais={iniciais.dados.referencias}
          fonte={iniciais.dados.fonte}
        />
      ) : (
        <Card>
          <EmptyState
            tom={iniciais.falha === "nao-configurada" ? "padrao" : "erro"}
            icon={iniciais.falha === "nao-configurada" ? <PlugZap /> : <Calculator />}
            title={iniciais.falha === "nao-configurada" ? "Calculadora não configurada" : "A calculadora não respondeu"}
            description={MENSAGEM_DA_FALHA[iniciais.falha]}
            action={
              iniciais.falha === "nao-configurada" ? undefined : (
                <Button href={ROTA_DA_CALCULADORA} variant="secondary">
                  Tentar de novo
                </Button>
              )
            }
          />
        </Card>
      )}
    </PageContainer>
  );
}
