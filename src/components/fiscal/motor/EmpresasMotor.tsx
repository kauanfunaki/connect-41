import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { BlocoFiscal, TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";
import { doMotor, type TelaDoMotor } from "@/lib/fiscal/motor/tela";
import { cnpjFormatado, dataHora } from "@/lib/fiscal/motor/formato";
import { EditarEstabelecimento } from "./EditarEstabelecimento";

/**
 * Configurações › Empresas com o motor real: o cadastro de cada
 * estabelecimento no motor (`GET /empresas`), a edição parcial (`PUT`) e as
 * divergências do vínculo Company ↔ estabelecimento (J1.2), explícitas.
 */
export async function EmpresasMotor({ tela, permiteGerir }: { tela: TelaDoMotor; permiteGerir: boolean }) {
  const { contexto, motor, mapa } = tela;
  if (!contexto) return null;
  const lista = await doMotor(() => motor.cliente.listarEmpresas(contexto.raiz, true));
  const porId = new Map((lista.dados?.itens ?? []).map((e) => [e.id, e]));
  const podeEditar = permiteGerir && motor.escrita;
  return <div className="space-y-5">
    {lista.erro && <Aviso tom="atencao">{lista.erro}</Aviso>}
    <BlocoFiscal titulo="Estabelecimentos no motor" descricao={`Raiz ${contexto.raiz}. Vinculados às empresas do escritório pelo CNPJ.${!podeEditar ? " Edição indisponível para seu perfil ou sem escrita habilitada." : ""}`}>
      <TabelaFiscal vazio="Nenhum estabelecimento vinculado." descricaoVazio="Cadastre a empresa no Connect com o mesmo CNPJ do motor." colunas={["Estabelecimento", "CNPJ", "Obrigações", "Situação", "Atualizado", ...(podeEditar ? ["Ações"] : [])]} linhas={mapa.visiveis.map((v) => {
        const e = porId.get(v.id);
        const valores: Record<string, string> = {};
        if (e) {
          for (const k of ["razao_social", "nome_fantasia", "apelido", "codigo_externo", "codigo_dominio", "ie", "cod_mun"] as const) valores[k] = e[k];
          for (const [k, val] of Object.entries(e.config)) valores[k] = val === null ? "" : String(val);
        }
        return { id: String(v.id), celulas: [
          <span key="n" className="block text-left">{v.companyNome}<span className="block text-helper text-fg-muted">{v.rotulo}{v.matriz ? " · matriz" : ""}</span></span>,
          cnpjFormatado(v.cnpj),
          v.obrigacoes.map((o) => (o === "icms_ipi" ? "ICMS/IPI" : o === "contribuicoes" ? "Contribuições" : o)).join(", "),
          <Selo key="s" tom={v.ativo ? "sucesso" : "neutro"}>{v.ativo ? "Ativo" : "Inativo"}</Selo>,
          <span key="a" className="text-helper">{dataHora(e?.atualizado_em)}{e?.atualizado_por ? <span className="block text-fg-muted">por {e.atualizado_por}</span> : null}</span>,
          ...(podeEditar ? [e ? <EditarEstabelecimento key="ed" raiz={contexto.raiz} id={v.id} rotulo={v.companyNome} valores={valores} atualizadoEm={e.atualizado_em} /> : "—"] : []),
        ] };
      })} />
    </BlocoFiscal>
    {(mapa.semCadastro.length > 0 || mapa.semMotor.length > 0) && <BlocoFiscal titulo="Divergências do vínculo" descricao="Enquanto não forem resolvidas, estes estabelecimentos não aparecem nas telas fiscais.">
      <div className="space-y-3 text-ui">
        {mapa.semCadastro.length > 0 && <Aviso tom="atencao">No motor, sem empresa no Connect com o mesmo CNPJ: {mapa.semCadastro.map((e) => `${e.rotulo || e.razao_social} (${cnpjFormatado(e.cnpj)})`).join("; ")}.</Aviso>}
        {mapa.semMotor.length > 0 && <Aviso tom="info">Empresas do Connect nesta raiz que o motor não tem: {mapa.semMotor.map((c) => `${c.nome} (${cnpjFormatado(c.cnpj)})`).join("; ")}.</Aviso>}
      </div>
    </BlocoFiscal>}
  </div>;
}
