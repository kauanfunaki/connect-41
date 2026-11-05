// Leitura de CSV do Connect Tributário, portada de dev41tech/connect-tributario,
// arquivo `lib/csv-import.ts`, commit 0fcc797 (14/10/2026). Cópia fiel: NÃO altere as regras
// de leitura aqui — os testes-gabarito do motor dependem dela. Sem dependências.

export const csvTemplate='empresa;cenario;cnpj;receita_anual;rbt12;folha12;custos;base_cbs;base_ibs;base_pis_cofins\nEmpresa exemplo;Base;;1200000;1200000;360000;900000;240000;240000;240000\n';
const columns:Record<string,string>={empresa:'name',cenario:'scenario',cnpj:'cnpj',receita_anual:'revenue',rbt12:'rbt12',folha12:'payroll',custos:'costs',base_cbs:'cbsCreditBase',base_ibs:'ibsCreditBase',base_pis_cofins:'pisCreditBase'};
export function readCSVRows(raw:string,limit=100000){
 if(raw.length>limit)throw Error('CSV acima do limite de '+Math.round(limit/1000)+' KB.');
 const text=raw.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
 const rows:string[][]=[],row:string[]=[];let field='',quoted=false;
 for(let i=0;i<=text.length;i++){const c=text[i]??'\n';if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++}else if(quoted||field==='')quoted=!quoted;else throw Error('Aspas inválidas no CSV.');}else if((c===';'||c==='\n')&&!quoted){row.push(field.trim());field='';if(c==='\n'){if(row.some(v=>v!==''))rows.push([...row]);row.length=0}}else field+=c;}
 if(quoted)throw Error('Aspas não fechadas no CSV.');return rows;
}
export function parseScenarioCSV(raw:string):Record<string,string|number>{
 const rows=readCSVRows(raw);if(rows.length!==2)throw Error('O modelo simples exige um cabeçalho e exatamente uma linha de dados.');
 const [headers,values]=rows;if(headers.length!==values.length||new Set(headers).size!==headers.length)throw Error('Colunas repetidas ou quantidade de campos incorreta.');
 const out:Record<string,string|number>={};for(let i=0;i<headers.length;i++){const key=columns[headers[i]];if(!key)throw Error('Coluna desconhecida: '+headers[i]);if(['name','scenario','cnpj'].includes(key)){out[key]=values[i];continue}if(!/^\d+(,\d+)?$/.test(values[i]))throw Error('Valor inválido em '+headers[i]+'. Use número positivo, sem separador de milhares.');out[key]=Number(values[i].replace(',','.'));}
 if(!out.name||out.revenue===undefined||out.rbt12===undefined)throw Error('Empresa, receita_anual e rbt12 são obrigatórios.');
 return out;
}
// One annual managerial DRE. Inputs are positive magnitudes, entered once per category.
export const dreFields=[
 ['modelo','Modelo do arquivo','CONNECT_FISCAL_DRE_V1','Não altere esta linha. Preencha somente a coluna valor. Salve em CSV UTF-8 separado por ponto e vírgula.'],
 ['empresa','Razão social','','Obrigatório. Informe o nome completo da empresa.'],
 ['cnpj','CNPJ','','Opcional. Digite com pontos barra e hífen para preservar os zeros iniciais.'],
 ['ano_base','Ano-base da DRE','','Obrigatório. Quatro dígitos. Informe totais anuais de janeiro a dezembro pelo regime de competência.'],
 ['cenario','Nome do cenário','DRE cliente','Identificação livre da análise. Não altere os códigos na primeira coluna.'],
 ['receita_bruta','Receita bruta anual','','Obrigatório. Receita operacional sem CBS/IBS. Não use recebimentos bancários. Valores em R$ com vírgula decimal.'],
 ['devolucoes_descontos','Devoluções cancelamentos e descontos incondicionais','','Informe valor positivo ou 0 quando não houver. Será subtraído da receita.'],
 ['impostos_sobre_vendas','Tributos incidentes sobre a receita','','Informe valor positivo ou 0. Não inclua IRPJ/CSLL. No Simples informe a parcela do DAS sobre vendas com orientação contábil.'],
 ['custos_diretos','Custos de mercadorias produtos e serviços','','Informe valor positivo ou 0. Não repita pessoal depreciação ou outros valores lançados nas linhas abaixo.'],
 ['folha_encargos_dre','Custos e despesas com pessoal e encargos','','Informe salários pró-labore encargos e benefícios da DRE. Não repita em custos diretos ou despesas.'],
 ['despesas_administrativas','Despesas administrativas','','Informe valor positivo ou 0. Exclua pessoal e depreciação já lançados separadamente.'],
 ['despesas_comerciais','Despesas comerciais','','Informe valor positivo ou 0. Exclua pessoal lançado separadamente.'],
 ['outras_despesas_operacionais','Outras despesas operacionais','','Informe valor positivo ou 0. No Simples inclua a parcela da CPP do DAS aqui somente se ainda não estiver nos encargos.'],
 ['depreciacao_amortizacao','Depreciação e amortização','','Informe despesas do período ou 0. Não informe compra de bens nem parcelas de financiamento.'],
 ['receitas_financeiras','Receitas financeiras','','Informe juros e rendimentos reconhecidos no ano ou 0.'],
 ['despesas_financeiras','Despesas financeiras','','Informe juros e tarifas ou 0. Não inclua amortização do principal de empréstimos.'],
 ['outras_receitas','Outras receitas','','Informe valor positivo ou 0. Não inclua empréstimos aportes de sócios ou receitas já informadas.'],
 ['irpj_csll','IRPJ e CSLL da DRE','','Informe valor positivo ou 0. No Simples use a parcela correspondente do DAS. Usado somente na DRE importada.'],
 ['rbt12','RBT12 de referência para o Simples','','Obrigatório. Receita acumulada nos 12 meses da referência fiscal. Não é preenchida automaticamente pela receita da DRE.'],
 ['fs12','FS12 de referência para o Fator R','','Obrigatório. Informe folha e encargos conforme a referência fiscal ou 0. Pode diferir da despesa de pessoal na DRE.'],
 ['base_cbs','Base de compras elegíveis a CBS','','Opcional. Sem CBS/IBS. Preencha com orientação contábil. Vazio significa sem crédito até revisão.'],
 ['base_ibs','Base de compras elegíveis a IBS','','Opcional. Sem CBS/IBS. Preencha com orientação contábil. Vazio significa sem crédito até revisão.'],
 ['base_pis_cofins','Base de compras elegíveis a PIS/Cofins','','Opcional. Preencha com orientação contábil. Vazio significa sem crédito até revisão.'],
];
export type DRESource={version:1;format?:'simplified';period:string;importedAt:string;values:Record<string,number>};
export function dreSummary(v:Record<string,number>){
 const revenue=v.receita_bruta-v.devolucoes_descontos;
 const netRevenue=revenue-v.impostos_sobre_vendas;
 const grossProfit=netRevenue-v.custos_diretos;
 const operatingExpenses=v.folha_encargos_dre+v.despesas_administrativas+v.despesas_comerciais+v.outras_despesas_operacionais+v.depreciacao_amortizacao;
 const operatingProfit=grossProfit-operatingExpenses;
 const financialResult=v.receitas_financeiras-v.despesas_financeiras;
 const preTaxProfit=operatingProfit+financialResult+v.outras_receitas;
 return {revenue,netRevenue,grossProfit,operatingExpenses,operatingProfit,financialResult,preTaxProfit,netProfit:preTaxProfit-v.irpj_csll,margin:revenue>0?preTaxProfit/revenue*100:0,costs:v.custos_diretos+operatingExpenses+v.despesas_financeiras};
}
export function parseDRECSV(raw:string):{fields:Record<string,string|number>;dre:DRESource}{
 const [header,...rows]=readCSVRows(raw);
 if(header?.join(';')!=='codigo;conta;valor;orientacao')throw Error('Use o cabeçalho do modelo DRE: codigo;conta;valor;orientacao.');
 const inputs:Record<string,string>={};const known=new Set(dreFields.map(x=>x[0]));
 for(const row of rows){if(row.length!==4)throw Error('Linha inválida: '+row[0]+'. Mantenha as quatro colunas.');if(!known.has(row[0]))throw Error('Código desconhecido: '+row[0]);if(Object.hasOwn(inputs,row[0]))throw Error('Código duplicado: '+row[0]);inputs[row[0]]=row[2];}
 for(const [key,label] of dreFields)if(!Object.hasOwn(inputs,key))throw Error('Falta a linha: '+label);
 if(inputs.modelo!=='CONNECT_FISCAL_DRE_V1')throw Error('Versão do modelo DRE inválida. Baixe o modelo atualizado.');
 if(!inputs.empresa||inputs.empresa.length>160)throw Error('Preencha a razão social com até 160 caracteres.');
 if(!/^(19|20|21)\d{2}$/.test(inputs.ano_base))throw Error('Informe o ano-base com quatro dígitos.');
 const optional=['base_cbs','base_ibs','base_pis_cofins'];const values:Record<string,number>={};
 for(const [key,label] of dreFields.slice(5)){
  const value=inputs[key];if(value===''&&optional.includes(key)){values[key]=0;continue}
  if(!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(value))throw Error('Preencha “'+label+'” com um valor positivo ou 0. Use vírgula para centavos e não digite R$.');
  values[key]=Number(value.replace(/\./g,'').replace(',','.'));if(!Number.isFinite(values[key])||values[key]>1e12)throw Error('Valor acima do limite em '+label);
 }
 const result=dreSummary(values);if(result.revenue<=0)throw Error('A receita bruta deve superar as devoluções e descontos.');
 const fields={name:inputs.empresa,cnpj:inputs.cnpj,period:inputs.ano_base,scenario:inputs.cenario||'DRE cliente',revenue:result.revenue,rbt12:values.rbt12,payroll:values.fs12,costs:result.costs,margin:result.margin,cbsCreditBase:values.base_cbs,ibsCreditBase:values.base_ibs,pisCreditBase:values.base_pis_cofins,cbsCreditRate:100,ibsCreditRate:100,pisCreditRate:100};
 return {fields,dre:{version:1,period:inputs.ano_base,importedAt:new Date().toISOString(),values}};
}
export const simpleDREFields=[
 ['empresa','Empresa'],['cnpj','CNPJ'],['ano_base','Ano-base'],
 ['receita_bruta','Receita bruta anual'],['devolucoes_descontos','Devoluções e descontos'],['impostos_sobre_vendas','Impostos sobre vendas'],
 ['custos_diretos','Custos diretos'],['folha_encargos_dre','Pessoal e encargos'],['despesas_operacionais','Despesas operacionais'],
 ['depreciacao_amortizacao','Depreciação e amortização'],['receitas_financeiras','Receitas financeiras'],['despesas_financeiras','Despesas financeiras'],
 ['outras_receitas','Outras receitas'],['irpj_csll','IRPJ e CSLL'],
];
export const simpleFiscalFields=[['rbt12','RBT12'],['fs12','Folha para Fator R'],['base_cbs','Base de crédito CBS'],['base_ibs','Base de crédito IBS'],['base_pis_cofins','Base de crédito PIS/Cofins']];
export type DREDraft=Record<string,string>;
const quoted=(v:string)=>'"'+v.replaceAll('"','""')+'"';
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function parseSimpleDREValues(input:DREDraft){
 const expanded:Record<string,string>={modelo:'CONNECT_FISCAL_DRE_V1',empresa:input.empresa?.trim()??'',cnpj:input.cnpj??'',ano_base:input.ano_base??'',cenario:input.cenario||'DRE cliente'};
 for(const [key] of dreFields.slice(5))expanded[key]=input[key]?.trim()||'0';
 // The simplified operating expense field includes administration, selling and other operating expenses.
 expanded.despesas_administrativas=input.despesas_operacionais?.trim()||'0';
 expanded.despesas_comerciais='0';expanded.outras_despesas_operacionais='0';
 if(!input.receita_bruta?.trim())throw Error('Preencha a receita bruta anual.');
 const csv=[['codigo','conta','valor','orientacao'],...dreFields.map(([key,label,,help])=>[key,label,expanded[key],help])].map(row=>row.map(quoted).join(';')).join('\n');
 const parsed=parseDRECSV(csv);parsed.dre.format='simplified';return parsed;
}
export function parseSimpleDRECSV(raw:string){
 const [header,...rows]=readCSVRows(raw);
 if(header?.length!==2||normalized(header[0])!=='campo'||normalized(header[1])!=='valor')throw Error('Use o modelo simplificado com as colunas Campo e Valor.');
 const labels=new Map([...simpleDREFields,...simpleFiscalFields,['cenario','Cenário']].map(([key,label])=>[normalized(label),key]));
 const input:DREDraft={};
 for(const row of rows){if(row.length!==2)throw Error('Cada linha deve ter apenas Campo e Valor.');const key=labels.get(normalized(row[0]));if(!key)throw Error('Campo desconhecido: '+row[0]);if(Object.hasOwn(input,key))throw Error('Campo duplicado: '+row[0]);input[key]=row[1];}
 for(const key of ['empresa','ano_base','receita_bruta'])if(!input[key]?.trim())throw Error('Preencha '+simpleDREFields.find(row=>row[0]===key)![1]+'.');
 return parseSimpleDREValues(input);
}
export function exportSimpleDRECSV(input:DREDraft){
 // Validate before producing a file the customer will later import.
 parseSimpleDREValues(input);
 const rows=[['Campo','Valor'],...simpleDREFields.map(([key,label])=>[label,input[key]||(['empresa','cnpj','ano_base'].includes(key)?'':'0')]),...simpleFiscalFields.map(([key,label])=>[label,input[key]||'0']),['Cenário',input.cenario||'DRE cliente']];
 return '\uFEFF'+rows.map(row=>row.map(quoted).join(';')).join('\r\n')+'\r\n';
}
export function draftFromDRE(source:DRESource,identity:{name:string;cnpj:string;scenario:string}):DREDraft{
 const draft:DREDraft={empresa:identity.name,cnpj:identity.cnpj,ano_base:source.period,cenario:identity.scenario};
 for(const [key,value] of Object.entries(source.values))draft[key]=value.toFixed(2).replace('.',',');
 draft.despesas_operacionais=(source.values.despesas_administrativas+source.values.despesas_comerciais+source.values.outras_despesas_operacionais).toFixed(2).replace('.',',');
 return draft;
}
export function parseFinancialCSV(raw:string):{fields:Record<string,string|number>;dre:DRESource|null}{const key=readCSVRows(raw)[0]?.[0];return key==='codigo'?parseDRECSV(raw):normalized(key??'')==='campo'?parseSimpleDRECSV(raw):{fields:parseScenarioCSV(raw),dre:null};}
