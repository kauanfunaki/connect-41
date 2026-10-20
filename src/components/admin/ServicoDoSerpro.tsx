"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { testarConexaoSerpro } from "@/app/(app)/admin/integracoes/serpro-actions";

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * O que a conexão do Serpro tem por baixo: de quem é o certificado, até quando
 * vale, se está pronta para chamar — e o teste, que não é cobrado.
 *
 * Na demonstração (20/10/2026) não há certificado: o selo diz o ambiente, e o
 * teste faz a consulta de exemplo da documentação no trial do Serpro.
 */
export function ServicoDoSerpro({
  certificado,
  motivo,
  demonstracao,
}: {
  certificado: { titular: string | null; cnpj: string | null; validoAte: string | null } | null;
  /** Por que ainda não dá para chamar; null = pronta. */
  motivo: string | null;
  demonstracao: boolean;
}) {
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-fs-4 font-medium text-fg flex flex-wrap items-center gap-1.5">
            <ShieldCheck size={16} className="text-brand" /> Serpro: {demonstracao ? "demonstração e teste" : "certificado e teste"}
            {demonstracao && <Selo tom="atencao">Demonstração</Selo>}
          </h3>
          {demonstracao ? (
            <p className="text-ui text-fg-secondary mt-1">
              Ambiente de testes do Serpro, sem contrato: só responde aos exemplos fictícios da documentação, e nada é cobrado.
            </p>
          ) : certificado ? (
            <p className="text-ui text-fg-secondary mt-1">
              {certificado.titular ?? "Titular não lido"}
              {certificado.cnpj && <span className="tabular-nums"> · CNPJ {certificado.cnpj}</span>}
              {certificado.validoAte && <span className="tabular-nums"> · vale até {dataBr(certificado.validoAte)}</span>}
            </p>
          ) : (
            <p className="text-ui text-fg-muted mt-1">Nenhum certificado guardado.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Botão, e não `<Link>` com altura de botão escrita à mão (15/10/2026). */}
          <Button href="/autorizacoes/consumo" variant="secondary" size="sm">
            Consumo do mês
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={pendente}
            disabled={!!motivo}
            onClick={() =>
              startTransition(async () => {
                const r = await testarConexaoSerpro();
                setResultado(r.ok ? { ok: true, texto: r.texto } : { ok: false, texto: r.erro });
              })
            }
          >
            Testar conexão
          </Button>
        </div>
      </div>
      {motivo && <Aviso tom="atencao">{motivo}</Aviso>}
      {resultado && <Aviso tom={resultado.ok ? "sucesso" : "perigo"}>{resultado.texto}</Aviso>}
      <p className="text-micro text-fg-muted">
        {demonstracao
          ? "O teste faz a consulta de procurações do exemplo da documentação, na demonstração."
          : "O teste só autentica no Serpro, o que não é cobrado."}
      </p>
    </Card>
  );
}
