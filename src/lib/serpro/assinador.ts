// O assinador do termo de autorização (Fase 3, 27/10/2026): um script do
// PowerShell, com o termo dentro, que roda na máquina onde está o e-CNPJ de
// quem assina. A chave privada não sai de lá — nem para o Connect, nem para o
// Serpro: só o XML assinado volta (decisão do Kauan, 27/10/2026).
//
// Feito para o Windows PowerShell 5.1, que vem no Windows: usa o SignedXml do
// .NET Framework (o mesmo do modelo em C# do Serpro) e o certificado do
// repositório do Windows, A1 ou A3 (o token pede o PIN). Para teste, aceita um
// .pfx com -Pfx e -Senha.
//
// O PowerShell 5.1 lê o .ps1 sem BOM como ANSI e estraga os acentos do termo:
// quem baixa grava o arquivo com o BOM (ver BOM_DO_ASSINADOR).

/** O BOM que vai na frente do .ps1: sem ele, o PowerShell 5.1 troca os acentos do termo. */
export const BOM_DO_ASSINADOR = "﻿";
export const NOME_DO_ASSINADOR = "assinar-termo-serpro.ps1";
export const NOME_DO_TERMO_ASSINADO = "termo-assinado.xml";
/** As vigências que a tela oferece, em meses. A documentação não dá limite. */
export const VIGENCIAS_DO_TERMO = [6, 12, 24] as const;

/** Texto entre aspas simples do PowerShell: a aspa simples dobra. */
const aspas = (v: string) => `'${v.replace(/'/g, "''")}'`;

export function scriptDoAssinador(p: { xml: string; autor: { numero: string; nome: string }; contratante: string }): string {
  // O termo vai num here-string literal (@' … '@): nada dentro é interpretado.
  // Só quebraria com uma linha começando em '@, e o termo é uma linha só.
  if (/[\r\n]/.test(p.xml)) throw new Error("o termo tem de estar numa linha só");
  return [
    "# Assinador do termo de autorização do Serpro, gerado pelo Connect.",
    `# ${p.autor.nome} (${p.autor.numero}) autoriza ${p.contratante} a pedir ao Integra Contador em nome dele.`,
    "#",
    "# Como usar: na máquina onde está o certificado digital (e-CNPJ) de quem assina,",
    "# clique com o botão direito neste arquivo > Executar com o PowerShell.",
    `# O termo assinado sai na mesma pasta, como ${NOME_DO_TERMO_ASSINADO}: envie esse arquivo no Connect.`,
    "# O certificado e a senha não saem desta máquina.",
    "param([string]$Pfx, [string]$Senha)",
    "$ErrorActionPreference = 'Stop'",
    "",
    `$autor = ${aspas(p.autor.numero)}`,
    `$nomeDoAutor = ${aspas(p.autor.nome)}`,
    "$termo = @'",
    p.xml,
    "'@",
    "",
    "function Fechar([int]$codigo) {",
    "  if (-not $Pfx) { Read-Host 'Aperte Enter para fechar' | Out-Null }",
    "  exit $codigo",
    "}",
    "",
    "try {",
    "  Add-Type -AssemblyName System.Security",
    "  $pasta = Split-Path -Parent $MyInvocation.MyCommand.Path",
    `  $saida = Join-Path $pasta ${aspas(NOME_DO_TERMO_ASSINADO)}`,
    "",
    "  if ($Pfx) {",
    "    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($Pfx, $Senha, 'Exportable')",
    "  } else {",
    "    $agora = Get-Date",
    "    $certs = @(Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt $agora -and $_.Subject -match (':' + $autor + '(,|$)') })",
    "    if ($certs.Count -eq 0) {",
    "      Write-Host \"Nenhum certificado de $nomeDoAutor ($autor) válido e com chave privada nesta máquina.\" -ForegroundColor Red",
    "      Write-Host 'Instale o e-CNPJ (A1) ou conecte o token (A3) e rode de novo.'",
    "      Fechar 1",
    "    }",
    "    $cert = $certs | Sort-Object NotAfter -Descending | Select-Object -First 1",
    "  }",
    "  Write-Host \"Assinando com: $($cert.Subject)\"",
    "  Write-Host \"Certificado válido até: $($cert.NotAfter.ToString('dd/MM/yyyy'))\"",
    "",
    "  $doc = New-Object System.Xml.XmlDocument",
    "  $doc.PreserveWhitespace = $true",
    "  $doc.LoadXml($termo)",
    "",
    "  $assinatura = New-Object System.Security.Cryptography.Xml.SignedXml($doc)",
    "  $assinatura.SigningKey = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)",
    "  $assinatura.SignedInfo.CanonicalizationMethod = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'",
    "  $assinatura.SignedInfo.SignatureMethod = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'",
    "  $referencia = New-Object System.Security.Cryptography.Xml.Reference('')",
    "  $referencia.AddTransform((New-Object System.Security.Cryptography.Xml.XmlDsigEnvelopedSignatureTransform))",
    "  $referencia.AddTransform((New-Object System.Security.Cryptography.Xml.XmlDsigC14NTransform))",
    "  $referencia.DigestMethod = 'http://www.w3.org/2001/04/xmlenc#sha256'",
    "  $assinatura.AddReference($referencia)",
    "  $chave = New-Object System.Security.Cryptography.Xml.KeyInfo",
    "  $chave.AddClause((New-Object System.Security.Cryptography.Xml.KeyInfoX509Data($cert)))",
    "  $assinatura.KeyInfo = $chave",
    "  $assinatura.ComputeSignature()",
    "  [void]$doc.DocumentElement.AppendChild($doc.ImportNode($assinatura.GetXml(), $true))",
    "",
    "  # Confere antes de gravar: lê de novo e valida a assinatura.",
    "  $conferir = New-Object System.Xml.XmlDocument",
    "  $conferir.PreserveWhitespace = $true",
    "  $conferir.LoadXml($doc.OuterXml)",
    "  $lida = New-Object System.Security.Cryptography.Xml.SignedXml($conferir)",
    "  $lida.LoadXml($conferir.GetElementsByTagName('Signature', 'http://www.w3.org/2000/09/xmldsig#')[0])",
    "  if (-not $lida.CheckSignature($cert, $true)) { throw 'A assinatura gerada não conferiu.' }",
    "",
    "  [System.IO.File]::WriteAllText($saida, $doc.OuterXml, (New-Object System.Text.UTF8Encoding($false)))",
    "  Write-Host ''",
    "  Write-Host \"Pronto: $saida\" -ForegroundColor Green",
    `  Write-Host 'Envie este arquivo no Connect, em Configurações > Integrações > Serpro > Termo de autorização.'`,
    "  Fechar 0",
    "} catch {",
    "  Write-Host \"Não deu para assinar: $($_.Exception.Message)\" -ForegroundColor Red",
    "  Fechar 1",
    "}",
    "",
  ].join("\r\n");
}
