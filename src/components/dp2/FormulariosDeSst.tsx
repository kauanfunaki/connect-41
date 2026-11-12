// Os formulários dos eventos de saúde e segurança do eSocial no DP 2
// (12/11/2026, fase 3c): ASO (S-2220), condições ambientais (S-2240) e CAT
// (S-2210). Os códigos das tabelas do eSocial vêm do PCMSO, do LTCAT ou do
// atestado; o Connect confere o formato e aponta o que faltar.

import { CampoForm } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormularioDoDp2 } from "@/components/dp2/Formulario";
import { LATERALIDADES, SEM_AGENTE_NOCIVO, TIPOS_DE_ACIDENTE, TIPOS_DE_EXAME } from "@/lib/dp2/esocial/sst";
import { gerarAsoAction, gerarCatAction, gerarCondicaoAmbientalAction } from "@/app/(app)/dp2/actions";

type Pessoa = { id: string; name: string };

function Colaborador({ id, pessoas }: { id: string; pessoas: Pessoa[] }) {
  return (
    <CampoForm label="Colaborador" htmlFor={id}>
      <Select id={id} name="personId" required defaultValue="">
        <option value="" disabled>
          Escolha…
        </option>
        {pessoas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </CampoForm>
  );
}

const EPC_EPI: [string, string][] = [
  ["0", "Não se aplica"],
  ["1", "Não utiliza"],
  ["2", "Utiliza"],
];

export function FormulariosDeSst({ pessoas }: { pessoas: Pessoa[] }) {
  return (
    <div className="grid gap-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-fs-3 font-semibold text-fg mb-2">ASO (S-2220)</h3>
          <p className="text-fs-2 text-fg-muted mb-3">
            Um por exame. Os procedimentos são os códigos da Tabela 27 que estão no ASO (o exame clínico é 0295), separados por vírgula.
          </p>
          <FormularioDoDp2 acao={gerarAsoAction} rotulo="Gerar S-2220" rotuloEnviando="Gerando…" variante="secondary">
            <div className="grid gap-4 sm:grid-cols-2">
              <Colaborador id="aso_personId" pessoas={pessoas} />
              <CampoForm label="Tipo do exame" htmlFor="tipoExame">
                <Select id="tipoExame" name="tipoExame" defaultValue="0">
                  {TIPOS_DE_EXAME.map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="Data do ASO" htmlFor="dataAso">
                <CampoData id="dataAso" name="dataAso" required />
              </CampoForm>
              <CampoForm label="Resultado" htmlFor="resultado">
                <Select id="resultado" name="resultado" defaultValue="1">
                  <option value="1">Apto</option>
                  <option value="2">Inapto</option>
                </Select>
              </CampoForm>
              <CampoForm label="Procedimentos (Tabela 27)" htmlFor="procedimentos" className="sm:col-span-2">
                <Input id="procedimentos" name="procedimentos" placeholder="0295" defaultValue="0295" />
              </CampoForm>
              <CampoForm label="Médico que assinou" htmlFor="aso_medicoNome" className="sm:col-span-2">
                <Input id="aso_medicoNome" name="medicoNome" maxLength={70} />
              </CampoForm>
              <CampoForm label="CRM" htmlFor="aso_medicoCrm">
                <Input id="aso_medicoCrm" name="medicoCrm" inputMode="numeric" maxLength={10} />
              </CampoForm>
              <CampoForm label="UF do CRM" htmlFor="aso_medicoUf">
                <Input id="aso_medicoUf" name="medicoUf" maxLength={2} />
              </CampoForm>
            </div>
          </FormularioDoDp2>
        </div>

        <div>
          <h3 className="text-fs-3 font-semibold text-fg mb-2">Condições ambientais (S-2240)</h3>
          <p className="text-fs-2 text-fg-muted mb-3">
            Na admissão e quando a condição mudar. Sem agente nocivo, deixe os agentes vazios: o evento sai com {SEM_AGENTE_NOCIVO} (ausência de agente).
          </p>
          <FormularioDoDp2 acao={gerarCondicaoAmbientalAction} rotulo="Gerar S-2240" rotuloEnviando="Gerando…" variante="secondary">
            <div className="grid gap-4 sm:grid-cols-2">
              <Colaborador id="amb_personId" pessoas={pessoas} />
              <CampoForm label="Vale a partir de" htmlFor="inicioCondicao">
                <CampoData id="inicioCondicao" name="inicioCondicao" required />
              </CampoForm>
              <CampoForm label="Setor" htmlFor="setor">
                <Input id="setor" name="setor" maxLength={100} placeholder="Produção" />
              </CampoForm>
              <CampoForm label="Agentes nocivos (Tabela 24)" htmlFor="agentes" helper="Ex.: 01.18.001, 02.01.006. Vazio: sem agente.">
                <Input id="agentes" name="agentes" />
              </CampoForm>
              <CampoForm label="Atividade" htmlFor="atividade" className="sm:col-span-2">
                <Textarea id="atividade" name="atividade" rows={2} maxLength={999} />
              </CampoForm>
              <CampoForm label="EPC" htmlFor="usaEpc">
                <Select id="usaEpc" name="usaEpc" defaultValue="0">
                  {EPC_EPI.map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </Select>
              </CampoForm>
              <CampoForm label="EPI" htmlFor="usaEpi">
                <Select id="usaEpi" name="usaEpi" defaultValue="0">
                  {EPC_EPI.map(([k, r]) => (
                    <option key={k} value={k}>
                      {r}
                    </option>
                  ))}
                </Select>
              </CampoForm>
            </div>
          </FormularioDoDp2>
        </div>
      </div>

      <div>
        <h3 className="text-fs-3 font-semibold text-fg mb-2">Acidente de trabalho (CAT, S-2210)</h3>
        <p className="text-fs-2 text-fg-muted mb-3">
          Prazo: até o 1º dia útil seguinte ao acidente (de imediato, em caso de óbito). Os códigos de 9 dígitos são das Tabelas 13 a 17 do eSocial.
        </p>
        <FormularioDoDp2 acao={gerarCatAction} rotulo="Gerar S-2210" rotuloEnviando="Gerando…" variante="secondary">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Colaborador id="cat_personId" pessoas={pessoas} />
            <CampoForm label="Tipo" htmlFor="tipoAcidente">
              <Select id="tipoAcidente" name="tipoAcidente" defaultValue="1">
                {TIPOS_DE_ACIDENTE.map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Data do acidente" htmlFor="dataAcidente">
              <CampoData id="dataAcidente" name="dataAcidente" required />
            </CampoForm>
            <CampoForm label="Hora" htmlFor="horaAcidente" helper="HH:MM">
              <Input id="horaAcidente" name="horaAcidente" inputMode="numeric" maxLength={5} placeholder="09:30" />
            </CampoForm>
            <CampoForm label="Horas trabalhadas antes" htmlFor="horasTrabalhadasAntes" helper="HH:MM">
              <Input id="horasTrabalhadasAntes" name="horasTrabalhadasAntes" inputMode="numeric" maxLength={5} />
            </CampoForm>
            <CampoForm label="Último dia trabalhado" htmlFor="ultimoDiaTrabalhado" helper="Vazio: o dia do acidente.">
              <CampoData id="ultimoDiaTrabalhado" name="ultimoDiaTrabalhado" />
            </CampoForm>
            <CampoForm label="Situação geradora (Tabela 15)" htmlFor="situacaoGeradora">
              <Input id="situacaoGeradora" name="situacaoGeradora" inputMode="numeric" maxLength={9} />
            </CampoForm>
            <CampoForm label="Agente causador (Tabela 14/15)" htmlFor="agenteCausador">
              <Input id="agenteCausador" name="agenteCausador" inputMode="numeric" maxLength={9} />
            </CampoForm>
            <CampoForm label="Parte atingida (Tabela 13)" htmlFor="parteAtingida">
              <Input id="parteAtingida" name="parteAtingida" inputMode="numeric" maxLength={9} />
            </CampoForm>
            <CampoForm label="Lado" htmlFor="lateralidade">
              <Select id="lateralidade" name="lateralidade" defaultValue="0">
                {LATERALIDADES.map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </Select>
            </CampoForm>
            <CampoForm label="Local do acidente" htmlFor="localDescricao" className="sm:col-span-2">
              <Input id="localDescricao" name="localDescricao" maxLength={255} placeholder="Cozinha da loja" />
            </CampoForm>
            <CampoForm label="Logradouro" htmlFor="localLogradouro" className="sm:col-span-2">
              <Input id="localLogradouro" name="localLogradouro" maxLength={100} />
            </CampoForm>
            <CampoForm label="Número" htmlFor="localNumero">
              <Input id="localNumero" name="localNumero" maxLength={10} />
            </CampoForm>
            <CampoForm label="CEP" htmlFor="localCep">
              <Input id="localCep" name="localCep" inputMode="numeric" maxLength={9} />
            </CampoForm>
            <CampoForm label="Município (IBGE)" htmlFor="localMunicipio">
              <Input id="localMunicipio" name="localMunicipio" inputMode="numeric" maxLength={7} />
            </CampoForm>
            <CampoForm label="UF" htmlFor="localUf">
              <Input id="localUf" name="localUf" maxLength={2} />
            </CampoForm>
            <CampoForm label="Data do atendimento" htmlFor="dataAtendimento">
              <CampoData id="dataAtendimento" name="dataAtendimento" />
            </CampoForm>
            <CampoForm label="Hora do atendimento" htmlFor="horaAtendimento" helper="HH:MM">
              <Input id="horaAtendimento" name="horaAtendimento" inputMode="numeric" maxLength={5} />
            </CampoForm>
            <CampoForm label="Natureza da lesão (Tabela 17)" htmlFor="naturezaDaLesao">
              <Input id="naturezaDaLesao" name="naturezaDaLesao" inputMode="numeric" maxLength={9} />
            </CampoForm>
            <CampoForm label="CID" htmlFor="cid">
              <Input id="cid" name="cid" maxLength={6} placeholder="S61.0" />
            </CampoForm>
            <CampoForm label="Dias de tratamento" htmlFor="diasDeTratamento">
              <Input id="diasDeTratamento" name="diasDeTratamento" inputMode="numeric" maxLength={4} />
            </CampoForm>
            <CampoForm label="Médico do atendimento" htmlFor="emitenteNome">
              <Input id="emitenteNome" name="emitenteNome" maxLength={70} />
            </CampoForm>
            <CampoForm label="CRM" htmlFor="emitenteCrm">
              <Input id="emitenteCrm" name="emitenteCrm" inputMode="numeric" maxLength={10} />
            </CampoForm>
            <CampoForm label="UF do CRM" htmlFor="emitenteUf">
              <Input id="emitenteUf" name="emitenteUf" maxLength={2} />
            </CampoForm>
            <CampoForm label="Observação" htmlFor="observacaoCat" className="sm:col-span-2 lg:col-span-4">
              <Textarea id="observacaoCat" name="observacaoCat" rows={2} maxLength={999} />
            </CampoForm>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            <Checkbox id="houveAfastamento" name="houveAfastamento" label="Houve afastamento" />
            <Checkbox id="internacao" name="internacao" label="Houve internação" />
            <Checkbox id="comunicouPolicia" name="comunicouPolicia" label="Comunicado à polícia" />
            <Checkbox id="obito" name="obito" label="Óbito" />
          </div>
        </FormularioDoDp2>
      </div>
    </div>
  );
}
