import { spawn } from "node:child_process";
import { createHash, randomUUID, createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile, open, access } from "node:fs/promises";
import path from "node:path";
import mariadb from "mariadb";
import jwt from "jsonwebtoken";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const alvo = new URL(process.env.EFD_TEST_DATABASE_URL ?? "mysql://root:contabil-ci-only@127.0.0.1:33382/connect41");
if (alvo.hostname !== "127.0.0.1" || alvo.port !== "33382" || alvo.pathname !== "/connect41") throw new Error("Use somente o banco descartável local de verificação.");
const raiz=process.cwd(), saida=path.join(raiz,".local","efd");
await mkdir(path.join(saida,"evidencias"),{recursive:true});
const {workspace}=JSON.parse(await readFile(path.join(saida,"build-workspace.json"),"utf8"));
if(path.dirname(workspace)!==saida)throw new Error("Build fora da cópia isolada.");
const sistema=Object.fromEntries(["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","LOCALAPPDATA","APPDATA","USERPROFILE","COMSPEC","PATHEXT"].flatMap(k=>process.env[k]?[[k,process.env[k]]]:[]));
const segredo="efd-ui-local-jwt",cifra="efd-ui-local-cifra",tenant=randomUUID(),user=randomUUID(),base="http://127.0.0.1:33387";
const env={...sistema,DATABASE_URL:alvo.toString(),PORT:"33387",HOSTNAME:"127.0.0.1",NODE_ENV:"production",APP_DOMAIN:"",JWT_ACCESS_SECRET:segredo,JWT_REFRESH_SECRET:segredo+"-refresh",SECRETS_ENCRYPTION_KEY:cifra,NEXT_TELEMETRY_DISABLED:"1"};
const leitura="efd-leitura-contrato-local-0000000001",escrita="efd-escrita-contrato-local-0000000002";
const fila=[],replays=new Map(),chamadas=[];
let disponivel=true;
const textoEfd=Buffer.from("|0000|019|0|01012026|31012026|EMPRESA DE CONFERÊNCIA|17122471000175|\r\n","latin1");
const empresa=(id,cnpj,matriz)=>({id,cnpj,matriz,rotulo:matriz?"Matriz local":"Filial local",uf:matriz?"PR":"SC",ativo:true,obrigacoes:["icms_ipi","contribuicoes"],config:{}});
const empresas=[empresa(1,"17122471000175",true),empresa(2,"17122471000256",false)];
const arquivo={id:1,obrigacao:"icms_ipi",cnpj:empresas[0].cnpj,empresa_id:1,competencia:"2026-01",data_ini:"2026-01-01",data_fim:"2026-01-31",versao:1,considerado:true,superado_por:null,gerado_em:"2026-02-01T12:00:00Z",qtd_linhas:1,tamanho_bytes:textoEfd.length,nome_arquivo:"efd.txt",retificadora:false,validacao:{estado:"ok",erros:11,advertencias:0},entrega:{estado:"nao_registrada"},decisao_ate:1,defasado:false,defasado_fonte:"registro",decisoes_posteriores:0};
const logExecucao="Contrato local: preservar prod_aBc e os resultados recebidos.";
const apiFixture=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1:33386"),recurso=url.pathname.replace("/api/connect/v1","");
 const enviar=(status,dados)=>{res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"no-store"});res.end(JSON.stringify(dados));};
 if(url.pathname==="/health")return enviar(200,{ok:true});
 try{
  assert.ok(url.pathname.startsWith("/api/connect/v1/"));assert.equal(url.searchParams.get("cnpj_raiz"),"17122471");
  assert.equal(req.headers.authorization,"Bearer "+(req.method==="GET"?leitura:escrita));
  if(!disponivel)return enviar(503,{codigo:"integracao_desligada",erro:"Integração desativada no serviço local."});
  chamadas.push({metodo:req.method,recurso});
  if(req.method!=="GET"){
   const ator=JSON.parse(Buffer.from(req.headers["x-connect-ator"],"base64url").toString("utf8"));assert.equal(ator.id,user);assert.equal(ator.tenant,tenant);
   let raw="";for await(const chunk of req)raw+=chunk;const dados=JSON.parse(raw),chave=req.headers["idempotency-key"];
   if(replays.has(chave))return enviar(200,replays.get(chave));
   let resultado;
   if(recurso==="/execucoes"){
    assert.match(chave,/^c41:[a-f0-9-]{36}$/);assert.equal(dados.acao,"sped");assert.equal(dados.tipo_sped,"0");
    resultado={...dados,data_ini:dados.data_ini??"2026-01-01",data_fim:dados.data_fim??"2026-01-31",id:fila.length+1,cnpj:empresas[0].cnpj,rotulo:"Gerar SPED",estado:"pendente",solicitado_por:"Pessoa fiscal",solicitado_em:new Date().toISOString(),travada:false,pode_cancelar:true,pode_destravar:false,arquivo_ids:[]};fila.push(resultado);
   }else if(/^\/execucoes\/\d+\/cancelar$/.test(recurso)){
    resultado=fila.find(e=>e.id===Number(recurso.split("/")[2]));resultado.estado="cancelada";resultado.pode_cancelar=false;
   }else return enviar(404,{codigo:"nao_encontrado",erro:"Comando fora do contrato local."});
   replays.set(chave,resultado);return enviar(200,resultado);
  }
  if(recurso==="/empresas")return enviar(200,{itens:empresas,proximo_cursor:null});
  if(recurso==="/saude")return enviar(200,{versao_api:"1",agora:new Date().toISOString(),escrita_habilitada:true,banco:{ok:true,latencia_ms:1},agentes:[{agente_host:"executor-local",plataforma:"windows",visto_em:new Date().toISOString(),segundos_sem_sinal:0,item_em_execucao:null,fonte:"batimento"}],fila:{por_estado:{pendente:fila.filter(e=>e.estado==="pendente").length},pendente_mais_antigo_seg:null,executando_sem_batida:[]}});
  if(recurso==="/arquivos")return enviar(200,{itens:[arquivo],proximo_cursor:null});
  if(recurso==="/arquivos/1")return enviar(200,{...arquivo,totais:{documentos:1}});
  if(recurso==="/arquivos/1/validacao")return enviar(200,{...arquivo.validacao,achados:[],achados_total:11});
  if(recurso==="/arquivos/1/download"){res.writeHead(200,{"Content-Type":"text/plain; charset=ISO-8859-1","Content-Disposition":'attachment; filename="efd.txt"',"Content-Length":textoEfd.length,"X-Conteudo-SHA256":createHash("sha256").update(textoEfd).digest("hex")});return res.end(textoEfd);}
  if(recurso==="/execucoes"){const estados=url.searchParams.get("estado");return enviar(200,{itens:fila.filter(e=>!estados||estados.split(",").includes(e.estado)),proximo_cursor:null});}
  if(/^\/execucoes\/\d+$/.test(recurso))return enviar(200,fila.find(e=>e.id===Number(recurso.split("/")[2])));
  if(/^\/execucoes\/\d+\/log$/.test(recurso)){res.writeHead(200,{"Content-Type":"text/plain; charset=utf-8","X-Log-Truncado":"false","X-Execucao-Estado":"cancelada"});return res.end(logExecucao);}
  if(recurso.startsWith("/decisoes/")||recurso.includes("/decisoes")||recurso==="/registro-decisoes")return enviar(200,{itens:[],proximo_cursor:null});
  return enviar(404,{codigo:"nao_encontrado",erro:"Recurso fora do contrato local."});
 }catch(e){console.error(e);return enviar(500,{codigo:"erro_interno",erro:"Contrato inesperado no teste local."});}
});
const db=await mariadb.createConnection({host:alvo.hostname,port:33382,user:decodeURIComponent(alvo.username),password:decodeURIComponent(alvo.password),allowPublicKeyRetrieval:true});
const log=await open(path.join(saida,"ui-connect.log"),"w");
const resultado={sucesso:false,verificacoes:[],erros:[]};let next,browser;
const ok=s=>{resultado.verificacoes.push(s);console.log("OK: "+s);};
const cifrar=d=>{const iv=randomBytes(12),c=createCipheriv("aes-256-gcm",scryptSync(cifra,"connect41-tenant-secrets",32),iv);const b=Buffer.concat([c.update(JSON.stringify(d),"utf8"),c.final()]);return[iv.toString("hex"),c.getAuthTag().toString("hex"),b.toString("hex")].join(":");};
try{
  await db.query("USE connect41");
  await db.query("INSERT INTO tenants (id,name,slug,updatedAt) VALUES (?,?,?,NOW(3))",[tenant,"Escritório EFD local","efd-ui-"+tenant]);
  await db.query("INSERT INTO users (id,tenantId,name,email,passwordHash,role,updatedAt) VALUES (?,?,?,?,?,'ADMIN',NOW(3))",[user,tenant,"Pessoa fiscal",user+"@example.test","sem-login-real"]);
  await db.query("INSERT INTO sectors (id,tenantId,code,label,color,updatedAt) VALUES (?,?,'fiscal','Fiscal','#C5374B',NOW(3))",[randomUUID(),tenant]);
  await db.query("INSERT INTO user_sectors (userId,sectorCode) VALUES (?,'fiscal')",[user]);
  for(const cnpj of ["17122471000175","17122471000256"])await db.query("INSERT INTO companies (id,tenantId,name,cnpj,updatedAt) VALUES (?,?,?,?,NOW(3))",[randomUUID(),tenant,"Empresa EFD local",cnpj]);
  await db.query("INSERT INTO sped_sync_roots (tenantId,cnpjRaiz) VALUES (?,'17122471')",[tenant]);
  await db.query("INSERT INTO tenant_integrations (id,tenantId,integrationCode,instanceKey,enabled,configEnc,updatedAt) VALUES (?,?,'sped','default',true,?,NOW(3))",[randomUUID(),tenant,cifrar({baseUrl:"http://127.0.0.1:33386",serviceToken:leitura,serviceTokenEscrita:escrita})]);
  await new Promise((resolve,reject)=>{apiFixture.once("error",reject);apiFixture.listen(33386,"127.0.0.1",resolve);});
  next=spawn(process.execPath,[path.join(workspace,".next/standalone/server.js")],{cwd:path.join(workspace,".next/standalone"),env,windowsHide:true,stdio:["ignore",log.fd,log.fd]});
  for(const url of [base+"/api/health","http://127.0.0.1:33386/health"]){let pronto=false;for(let i=0;i<45;i++){try{if((await fetch(url)).ok){pronto=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert.ok(pronto,"Servidor disponível: "+url);}
  browser=await chromium.launch({headless:true,...(await access(chromium.executablePath()).then(()=>true,()=>false)?{}:{channel:"msedge"})});
  const contexto=await browser.newContext({viewport:{width:1366,height:768}});
  await contexto.addCookies([{name:"access_token",value:jwt.sign({sub:user,tenantId:tenant,role:"ADMIN",sectors:["fiscal"],accessibleTenants:[tenant]},segredo,{expiresIn:"30m"}),url:base,httpOnly:true,sameSite:"Lax"},{name:"active_sector_code",value:"fiscal",url:base},{name:"theme",value:"light",url:base}]);
  const page=await contexto.newPage();page.setDefaultTimeout(20000);page.on("pageerror",e=>resultado.erros.push(e.message));
  const selecao="raiz=17122471&estab=1&competencia=2026-01";
  await page.goto(base+"/fiscal/entregas?"+selecao);
  await page.getByRole("link",{name:"Baixar",exact:true}).first().waitFor();
  const pular=page.getByRole("button",{name:"Pular tutorial",exact:true});if(await pular.isVisible())await pular.click();
  assert.doesNotMatch(await page.locator("main").innerText(),/simula|dados fictícios|cenário de teste|restaurar cenário|prévia fiscal/i);
  const download=page.waitForEvent("download");await page.getByRole("link",{name:"Baixar",exact:true}).first().click();const d=await download;await d.saveAs(path.join(saida,"evidencias","efd.txt"));
  assert.deepEqual(await readFile(path.join(saida,"evidencias","efd.txt")),textoEfd);
  ok("API /api/connect/v1: arquivos e download com bytes preservados");
  await page.screenshot({path:path.join(saida,"evidencias","01-arquivos.png"),animations:"disabled"});
  await page.goto(base+"/fiscal/operacao?"+selecao);
  await page.getByRole("combobox",{name:"Tipo do arquivo",exact:true}).click();await page.getByRole("option",{name:"Original",exact:true}).click();
  await page.getByRole("button",{name:"Solicitar geração",exact:true}).click();
  await page.getByRole("button",{name:"Cancelar",exact:true}).first().waitFor();
  assert.equal(fila.length,1);assert.equal(fila[0].empresa_id,1);
  await page.getByRole("button",{name:"Cancelar",exact:true}).first().click();await page.getByRole("alertdialog").getByRole("button",{name:"Cancelar pedido",exact:true}).click();
  await page.getByRole("alertdialog").waitFor({state:"hidden"});await page.getByRole("table").getByRole("button",{name:"Cancelar",exact:true}).waitFor({state:"detached"});assert.equal(fila[0].estado,"cancelada");
  ok("Server Actions enviam geração e cancelamento pelo contrato, com ator e idempotência");
  await page.goto(base+"/fiscal/operacao?"+selecao+"&aba=historico&execucao=1");await page.getByText(logExecucao,{exact:true}).waitFor();
  await page.reload();await page.getByText(logExecucao,{exact:true}).waitFor();
  ok("Histórico e log permanecem acessíveis após atualizar a página");
  await page.screenshot({path:path.join(saida,"evidencias","02-historico.png"),animations:"disabled"});
  for(const [width,height,nome]of [[1093,614,"125"],[911,512,"150"],[683,384,"200"],[390,844,"celular"]]){await page.setViewportSize({width,height});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"Sem transbordamento: "+nome);await page.screenshot({path:path.join(saida,"evidencias","tela-"+nome+".png"),animations:"disabled"});}
  ok("Interface em 1366×768, áreas úteis de 125%, 150% e 200% e celular");
  await page.goto(base+"/fiscal/documentos?"+selecao);await page.getByText(/ainda não disponível no Connect/).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(),/simula|dados fictícios|restaurar cenário|prévia fiscal/i);
  ok("Áreas sem endpoint orientam o uso do painel SPED");
  disponivel=false;await page.goto(base+"/fiscal?"+selecao);await page.getByText("A integração com o motor SPED está desligada no servidor do motor.",{exact:true}).first().waitFor();
  ok("API desligada apresenta a falha de conexão");
  await db.query("UPDATE tenant_integrations SET enabled=false WHERE tenantId=? AND integrationCode='sped'",[tenant]);await page.reload();await page.getByText("Processamento fiscal indisponível",{exact:true}).waitFor();
  assert.doesNotMatch(await page.locator("main").innerText(),/simula|dados fictícios|restaurar cenário|prévia fiscal/i);
  ok("Integração desligada permanece indisponível sem fallback local");
  assert.ok(chamadas.some(c=>c.recurso==="/execucoes"&&c.metodo==="POST"));
  assert.deepEqual(resultado.erros,[]);resultado.sucesso=true;
}catch(e){if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0])await pages[0].screenshot({path:path.join(saida,"evidencias","falha.png"),fullPage:true});}throw e;}finally{await writeFile(path.join(saida,"resultado-ui.json"),JSON.stringify(resultado,null,2));if(browser)await browser.close();if(next)next.kill();await new Promise(resolve=>apiFixture.close(resolve));await log.close();await db.end();}
