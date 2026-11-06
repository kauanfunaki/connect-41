// Avaliação (estudo) do Connect Tributário, portada de dev41tech/connect-tributario,
// arquivo `lib/studies/consolidation.ts`, commit 0fcc797 (14/10/2026). Cópia fiel das regras: NÃO altere
// cálculos aqui. Ajustes do porte (mecânicos): imports sem a extensão .ts apontando para ../motor
// e `.prefault({})` no lugar de `.default({})` em objeto (zod 4). Na Fase 1 não há documentos:
// `assess(study, [])` usa só os valores informados; os tipos de fato e documento ficam para a Fase 2.
// Também mecânicos: `Number(v).toLocaleString` (forma aceita pelo ESLint) e imports sem uso removidos.

import {type Study,type Fact,fieldLabels,isoDate} from './model';
export type Resolved={value:number|null;source:string;facts:Fact[];issue:string|null;manual:boolean};
const cents=(n:number)=>Math.round((n+Number.EPSILON)*100);
const equal=(a:number,b:number)=>Math.abs(cents(a)-cents(b))<=1;
const nextDay=(s:string)=>new Date(Date.parse(s+'T00:00:00Z')+86400000).toISOString().slice(0,10);
export const factSignature=(facts:Fact[])=>facts.map(f=>f.id+':'+f.value).sort().join('|');
export function resolveField(s:Study,field:string,all:Fact[]):Resolved{
 const manual=s.values[field],hasManual=manual!==null&&manual!==undefined;
 const datesValid=isoDate.safeParse(s.start).success&&isoDate.safeParse(s.end).success;
 const facts=datesValid?all.filter(f=>f.field===field&&(f.cancelled||f.start>=s.start&&f.end<=s.end)):[];
 let value:number|null=null,issue:string|null=null,selected:Fact[]=[];
 const tx=facts.filter(f=>f.basis==='transaction');
 if(tx.length){const seen=new Map<string,Fact>();for(const f of tx){const key=f.identity||f.id;const prev=seen.get(key);if(f.cancelled){seen.set(key,f);continue;}if(prev?.cancelled)continue;if(prev&&!equal(prev.value,f.value))issue='O mesmo documento possui valores divergentes.';else seen.set(key,f);}selected=[...seen.values()];value=selected.reduce((a,f)=>a+(f.cancelled?0:f.value),0);}
 else if(facts.length){
  const references=facts.filter(f=>f.basis==='reference'||f.basis==='balance');
  if(references.length){const last=references.map(f=>f.end).sort().at(-1)!;selected=references.filter(f=>f.end===last);value=selected[0].value;if(selected.some(f=>!equal(f.value,value!)))issue='Fontes divergentes na mesma data-base.';}
  else{
   const grouped=new Map<string,Fact[]>();for(const f of facts){const k=f.start+'|'+f.end;grouped.set(k,[...(grouped.get(k)||[]),f]);}
   const groups=[...grouped.values()];
   if(groups.some(g=>g.some(f=>!equal(f.value,g[0].value))))issue='Dois documentos informam valores diferentes para o mesmo período.';
   const exact=groups.find(g=>g[0].start===s.start&&g[0].end===s.end);
   if(exact){selected=exact;value=exact[0].value;
    const partial=groups.filter(g=>g!==exact).map(g=>g[0]).sort((a,b)=>a.start.localeCompare(b.start));
    let cursor=s.start,sum=0,complete=true;for(const f of partial){if(f.start!==cursor){complete=false;break;}sum+=f.value;cursor=nextDay(f.end);}
    if(partial.length&&complete&&cursor===nextDay(s.end)&&!equal(sum,value))issue='O total difere da soma dos períodos detalhados.';
   }else{
    const ordered=groups.map(g=>g[0]).sort((a,b)=>a.start.localeCompare(b.start));let cursor=s.start,sum=0;
    for(const f of ordered){if(f.start!==cursor){issue=f.start<cursor?'Períodos sobrepostos: não foram somados.':'Faltam períodos para compor o total.';break;}sum+=f.value;cursor=nextDay(f.end);selected.push(f);}
    if(cursor===nextDay(s.end)&&!issue)value=sum;else issue=issue||'Os documentos não cobrem todo o período selecionado.';
   }
  }
 }
 if(hasManual){if(value!==null&&!equal(manual,value))issue=`O valor informado difere dos documentos (${Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2})}). O valor manual foi preservado.`;if(s.acceptedSources[field]===factSignature(facts))issue=null;return {value:manual,source:'Informado por você',facts:selected,issue,manual:true};}
 return {value:issue?null:value,source:selected.length?selected.length===1?selected[0].filename:selected.length+' evidências':'Não informado',facts:selected,issue,manual:false};
}
export function consolidate(s:Study,facts:Fact[]){return Object.fromEntries(Object.keys(fieldLabels).map(k=>[k,resolveField(s,k,facts)]));}
export function stepCoverage(s:Study,fields:string[],values:Record<string,Resolved>){const known=fields.filter(k=>values[k]?.value!==null&&values[k]?.value!==undefined).length;return {known,total:fields.length,issues:fields.filter(k=>values[k]?.issue).length};}
