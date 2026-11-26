"use client";

import { useState } from "react";
import { Building2, CircleCheck, Eye, FileText, TriangleAlert, UserPen } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { SlideOver } from "@/components/ui/SlideOver";
import { formatCnpj, formatInstantDate } from "@/lib/format";
import type { EmpresaParaTermo } from "@/lib/honorarios/termo/servidor";
import { AcoesDaLinha, CLASSE_DA_TABELA, NomeQueAbre, PeDoPainel, SecaoDoPainel, SeloDaSituacao, SubtituloDoPainel, type AcaoPrincipal } from "./PecasDaLista";

// Aba Termo aditivo no padrão das outras (26/11/2026, melhoria-813): era a
// única tabela fora da `.c41-tabela` (cabeçalho sem caixa alta), sem detalhe e
// com a ação num link. Agora o selo tem ícone, a ação é botão e o nome abre o
// painel com o que falta para gerar.

const textoDaFalta = (e: EmpresaParaTermo) => (e.socio ? "Falta o CPF" : "Falta o sócio");
const trechos = (n: number) => (n === 1 ? "1 trecho opcional sem dados" : `${n} trechos opcionais sem dados`);

function acaoDoTermo(e: EmpresaParaTermo, temModelo: boolean): AcaoPrincipal {
  const gerar = e.podeGerar && temModelo;
  return {
    rotulo: gerar ? "Gerar termo" : "Completar dados",
    icone: gerar ? <FileText aria-hidden /> : <UserPen aria-hidden />,
    href: `/honorarios/termo/${e.companyId}`,
  };
}

export function TabelaDoTermo({ empresas, temModelo, semEmpresas }: { empresas: EmpresaParaTermo[]; temModelo: boolean; semEmpresas: boolean }) {
  const [painel, setPainel] = useState<string | null>(null);

  if (!empresas.length) {
    return (
      <div className="c41-sem-linhas">
        <EmptyState
          title={semEmpresas ? "Nenhuma empresa ativa com CNPJ" : "Nenhuma empresa com estes filtros"}
          description={semEmpresas ? "O termo é gerado para as empresas ativas do cadastro." : "Tire um filtro ou mude a busca."}
          icon={<FileText />}
        />
      </div>
    );
  }

  const aberta = empresas.find((e) => e.companyId === painel) ?? null;

  return (
    <>
      <div className={CLASSE_DA_TABELA}>
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Sócio que assina</th>
              <th>Situação</th>
              <th>Último termo</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.companyId}>
                <td>
                  <NomeQueAbre nome={e.nome} sub={formatCnpj(e.cnpj)} aberto={painel === e.companyId} aoAbrir={() => setPainel(e.companyId)} />
                </td>
                <td>{e.socio ? <span className="inline-block max-w-[14rem] truncate align-bottom" title={e.socio}>{e.socio}</span> : <span className="text-fg-muted">—</span>}</td>
                <td>
                  {e.podeGerar ? (
                    <SeloDaSituacao tom="sucesso" icone={<CircleCheck aria-hidden />} mais={0} dica={e.recomendacoes > 0 ? `Pronta para gerar\n• ${trechos(e.recomendacoes)}` : "Pronta para gerar"}>
                      Pronta
                    </SeloDaSituacao>
                  ) : (
                    <SeloDaSituacao
                      tom="atencao"
                      icone={<TriangleAlert aria-hidden />}
                      dica={`${textoDaFalta(e)} do sócio administrador${e.recomendacoes > 0 ? `\n• ${trechos(e.recomendacoes)}` : ""}`}
                    >
                      {textoDaFalta(e)}
                    </SeloDaSituacao>
                  )}
                </td>
                <td>{e.ultimoTermo ? formatInstantDate(e.ultimoTermo) : <span className="text-fg-muted">—</span>}</td>
                <td>
                  <AcoesDaLinha
                    nome={e.nome}
                    principal={acaoDoTermo(e, temModelo)}
                    menu={[
                      { rotulo: "Ver detalhes", icone: <Eye />, onClick: () => setPainel(e.companyId) },
                      { rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${e.companyId}` },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SlideOver open={!!aberta} onClose={() => setPainel(null)} title={aberta?.nome} width="max-w-lg">
        {aberta && (
          <>
            <SubtituloDoPainel partes={[formatCnpj(aberta.cnpj)]} empresaId={aberta.companyId} />
            <SecaoDoPainel rotulo="Sócio que assina">
              {aberta.socio ? <p className="text-fg">{aberta.socio}</p> : <p className="text-fg-muted">Nenhum sócio administrador no cadastro.</p>}
            </SecaoDoPainel>
            <SecaoDoPainel rotulo="Situação">
              <p className="flex flex-wrap items-center gap-2">
                {aberta.podeGerar ? <Selo tom="sucesso">Pronta para gerar</Selo> : <Selo tom="atencao">{textoDaFalta(aberta)}</Selo>}
                {!aberta.podeGerar && <span>Complete o sócio administrador, com o CPF, na tela do termo.</span>}
              </p>
              {aberta.recomendacoes > 0 && <p className="mt-1.5 text-fg-muted">{trechos(aberta.recomendacoes)}: o termo sai sem esses trechos.</p>}
              {!temModelo && <p className="mt-1.5 text-warning-fg">O modelo do termo em Word ainda não foi enviado.</p>}
            </SecaoDoPainel>
            <SecaoDoPainel rotulo="Último termo gerado no Connect">
              <p className={aberta.ultimoTermo ? "text-fg" : "text-fg-muted"}>{aberta.ultimoTermo ? formatInstantDate(aberta.ultimoTermo) : "Nenhum ainda."}</p>
            </SecaoDoPainel>
            <PeDoPainel
              nome={aberta.nome}
              menu={[{ rotulo: "Abrir empresa", icone: <Building2 />, href: `/empresas/${aberta.companyId}` }]}
              principal={acaoDoTermo(aberta, temModelo)}
            />
          </>
        )}
      </SlideOver>
    </>
  );
}
