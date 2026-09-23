<#
.SYNOPSIS
  Confere os certificados digitais (.pfx/.p12) contra as senhas do cofre do KeePassXC.

.DESCRIPTION
  Para cada certificado da pasta, descobre qual senha do cofre o abre, lê de dentro dele o
  CNPJ (ou CPF), o titular e o vencimento, e gera um relatório SEM NENHUMA SENHA:

    certificados.csv            um por arquivo: documento, titular, vencimento, situação e
                                qual entrada do cofre o abriu
    entradas-sem-certificado.csv  entradas do cofre cuja senha não abriu nenhum arquivo

  Por padrão só lê: o cofre não é alterado. Com -Gravar, preenche o campo Usuário de cada
  entrada com o CNPJ e acrescenta nas Notas o nome do arquivo — só nas entradas em que a
  correspondência é segura (ver coluna "Conferir"). Antes de gravar, faz uma cópia do cofre.

  As senhas ficam só na memória deste processo: nada com senha é gravado em disco.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\conferir-certificados.ps1 `
    -Cofre "\\servidor\41 Tech\Certificados 41.kdbx" `
    -ArquivoChave "C:\Robo\certificados-41.keyx" `
    -PastaCertificados "\\servidor\41 Tech\Certificados"
#>
param(
  [Parameter(Mandatory = $true)] [string] $Cofre,
  [Parameter(Mandatory = $true)] [string] $ArquivoChave,
  [Parameter(Mandatory = $true)] [string] $PastaCertificados,
  [string] $Saida = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'conferencia-certificados'),
  [int] $DiasDeAviso = 30,
  [int] $TentativasLentas = 5,
  [Security.SecureString] $SenhaMestra,
  [switch] $Gravar
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security

# ---------------------------------------------------------------- pré-requisitos

$cli = @(
  "$env:ProgramFiles\KeePassXC\keepassxc-cli.exe",
  "${env:ProgramFiles(x86)}\KeePassXC\keepassxc-cli.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cli) { throw 'Não achei o keepassxc-cli.exe. O KeePassXC está instalado em Arquivos de Programas?' }

foreach ($p in @($Cofre, $ArquivoChave, $PastaCertificados)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "Não achei: $p" }
}

# O keepassxc-cli lê a senha mestra pela entrada padrão e escreve em UTF-8.
$utf8 = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = $utf8
[Console]::OutputEncoding = $utf8

$seguro = if ($SenhaMestra) { $SenhaMestra } else { Read-Host 'Senha mestra do cofre' -AsSecureString }
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try { $senhaDoCofre = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

# ---------------------------------------------------------------- funções

function Normalizar([string] $texto) {
  if (-not $texto) { return @() }
  $d = $texto.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object Text.StringBuilder
  foreach ($ch in $d.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne 'NonSpacingMark') { [void]$sb.Append($ch) }
  }
  $vazias = @('LTDA', 'EIRELI', 'EPP', 'CIA', 'DOS', 'DAS', 'COM', 'SERVICOS', 'COMERCIO', 'PFX', 'P12',
    'CERTIFICADO', 'CERT', 'ECNPJ', 'ECPF', 'SOCIEDADE', 'LIMITADA', 'EMPRESA', 'INDIVIDUAL', 'UNIPESSOAL')
  ($sb.ToString().ToUpperInvariant() -split '[^A-Z0-9]+') |
    Where-Object { $_.Length -ge 3 -and $vazias -notcontains $_ -and $_ -notmatch '^\d+$' } |
    Select-Object -Unique
}

# Quantas palavras do título do cofre aparecem no outro texto.
function Pontuar($palavrasTitulo, $palavrasOutro) {
  if (-not $palavrasTitulo -or -not $palavrasOutro) { return 0 }
  @($palavrasTitulo | Where-Object { $palavrasOutro -contains $_ }).Count
}

# O Windows leva ~4 s para recusar uma senha errada num .pfx; com 192 senhas por arquivo, a
# conferência levaria dias. O MAC do PKCS#12 (RFC 7292) diz se a senha é a certa em menos de
# 1 ms, então só a senha certa chega ao Windows. Arquivo em formato que este leitor não
# entende (Ler devolve $null) cai no caminho lento, limitado a $TentativasLentas senhas.
Add-Type -TypeDefinition @'
using System;
using System.Security.Cryptography;
using System.Text;

public class SenhaDoPfx {
  // Leitor BER mínimo: aceita tamanho indefinido (0x80 ... 00 00) e OCTET STRING em pedaços
  // (0x24), que é como alguns emissores gravam o .pfx. Tamanho -1 = indefinido.
  static int Cabecalho(byte[] b, ref int p, out int tamanho) {
    int tag = b[p++];
    int l = b[p++];
    if (l == 0x80) { tamanho = -1; return tag; }
    if ((l & 0x80) != 0) {
      int n = l & 0x7F; l = 0;
      for (int i = 0; i < n; i++) l = (l << 8) | b[p++];
    }
    tamanho = l;
    return tag;
  }

  static bool FimIndefinido(byte[] b, ref int p) {
    if (b[p] == 0 && b[p + 1] == 0) { p += 2; return true; }
    return false;
  }

  static void Pular(byte[] b, ref int p) {
    int t; Cabecalho(b, ref p, out t);
    if (t >= 0) { p += t; return; }
    while (!FimIndefinido(b, ref p)) Pular(b, ref p);
  }

  static void Octetos(byte[] b, ref int p, System.IO.MemoryStream saida) {
    int t; int tag = Cabecalho(b, ref p, out t);
    if (tag == 0x04) { saida.Write(b, p, t); p += t; return; }
    if (tag != 0x24) throw new FormatException("não é OCTET STRING");
    if (t >= 0) { int fim = p + t; while (p < fim) Octetos(b, ref p, saida); }
    else while (!FimIndefinido(b, ref p)) Octetos(b, ref p, saida);
  }

  static byte[] Bytes(byte[] b, ref int p) {
    var m = new System.IO.MemoryStream(); Octetos(b, ref p, m); return m.ToArray();
  }

  static bool Igual(byte[] b, int inicio, int tamanho, byte[] oid) {
    if (tamanho != oid.Length) return false;
    for (int i = 0; i < tamanho; i++) if (b[inicio + i] != oid[i]) return false;
    return true;
  }

  static readonly byte[] Sha1 = { 0x2B, 0x0E, 0x03, 0x02, 0x1A };
  static readonly byte[] Sha256 = { 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01 };
  static readonly byte[] Sha384 = { 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02 };
  static readonly byte[] Sha512 = { 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03 };

  byte[] dados, esperado, sal;
  long iteracoes;
  string hash;
  int v;

  // Lê a estrutura uma vez por arquivo. null = formato que este leitor não entende
  // (sem MAC, algoritmo desconhecido, arquivo corrompido).
  public static SenhaDoPfx Ler(byte[] pfx) {
    try {
      var r = new SenhaDoPfx();
      int p = 0, t;
      if (Cabecalho(pfx, ref p, out t) != 0x30) return null;     // PFX
      Pular(pfx, ref p);                                          // version
      int inicioAuth = p;
      if (Cabecalho(pfx, ref p, out t) != 0x30) return null;     // authSafe ContentInfo
      Pular(pfx, ref p);                                          // contentType (data)
      if (Cabecalho(pfx, ref p, out t) != 0xA0) return null;     // [0]
      r.dados = Bytes(pfx, ref p);
      p = inicioAuth; Pular(pfx, ref p);                          // fim do ContentInfo
      if (p >= pfx.Length || pfx[p] != 0x30) return null;        // sem MacData
      Cabecalho(pfx, ref p, out t);                               // MacData
      int inicioDigest = p;
      if (Cabecalho(pfx, ref p, out t) != 0x30) return null;     // DigestInfo
      int inicioAlg = p;
      if (Cabecalho(pfx, ref p, out t) != 0x30) return null;     // AlgorithmIdentifier
      if (Cabecalho(pfx, ref p, out t) != 0x06) return null;
      if (Igual(pfx, p, t, Sha1)) { r.hash = "SHA1"; r.v = 64; }
      else if (Igual(pfx, p, t, Sha256)) { r.hash = "SHA256"; r.v = 64; }
      else if (Igual(pfx, p, t, Sha384)) { r.hash = "SHA384"; r.v = 128; }
      else if (Igual(pfx, p, t, Sha512)) { r.hash = "SHA512"; r.v = 128; }
      else return null;
      p = inicioAlg; Pular(pfx, ref p);
      r.esperado = Bytes(pfx, ref p);
      p = inicioDigest; Pular(pfx, ref p);                        // fim do DigestInfo
      r.sal = Bytes(pfx, ref p);
      r.iteracoes = 1;
      if (p < pfx.Length && pfx[p] == 0x02) {
        Cabecalho(pfx, ref p, out t); r.iteracoes = 0;
        for (int i = 0; i < t; i++) r.iteracoes = (r.iteracoes << 8) | pfx[p + i];
      }
      if (r.iteracoes < 1 || r.iteracoes > 10000000) return null;
      return r;
    } catch (Exception) {
      return null;
    }
  }

  HashAlgorithm NovoHash() {
    if (hash == "SHA1") return SHA1.Create();
    if (hash == "SHA256") return SHA256.Create();
    if (hash == "SHA384") return SHA384.Create();
    return SHA512.Create();
  }

  public bool Confere(string senha) {
    // Chave do MAC: KDF do PKCS#12 com ID = 3 (RFC 7292, apêndice B.2).
    var h = NovoHash();
    byte[] senhaBmp = Encoding.BigEndianUnicode.GetBytes(senha + "\0");
    byte[] S = Repetir(sal, v), P = Repetir(senhaBmp, v);
    byte[] entrada = new byte[v + S.Length + P.Length];
    for (int i = 0; i < v; i++) entrada[i] = 3;
    Buffer.BlockCopy(S, 0, entrada, v, S.Length);
    Buffer.BlockCopy(P, 0, entrada, v + S.Length, P.Length);
    byte[] A = h.ComputeHash(entrada);
    for (long i = 1; i < iteracoes; i++) A = h.ComputeHash(A);

    HMAC mac;
    if (hash == "SHA1") mac = new HMACSHA1(A);
    else if (hash == "SHA256") mac = new HMACSHA256(A);
    else if (hash == "SHA384") mac = new HMACSHA384(A);
    else mac = new HMACSHA512(A);
    byte[] obtido = mac.ComputeHash(dados);
    if (obtido.Length != esperado.Length) return false;
    for (int i = 0; i < obtido.Length; i++) if (obtido[i] != esperado[i]) return false;
    return true;
  }

  static byte[] Repetir(byte[] origem, int v) {
    if (origem.Length == 0) return origem;
    byte[] r = new byte[v * ((origem.Length + v - 1) / v)];
    for (int i = 0; i < r.Length; i++) r[i] = origem[i % origem.Length];
    return r;
  }
}
'@

$flags = [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet

function AbrirCertificado([byte[]] $bytes, [string] $senha) {
  $colecao = New-Object Security.Cryptography.X509Certificates.X509Certificate2Collection
  try { $colecao.Import($bytes, $senha, $flags) } catch { return $null }
  $comChave = @($colecao | Where-Object { $_.HasPrivateKey })
  if ($comChave.Count -gt 0) { return $comChave[0] }
  if ($colecao.Count -gt 0) { return $colecao[0] }
  $null
}

# Valor de um "otherName" ICP-Brasil (2.16.76.1.3.x) dentro do Subject Alternative Name.
function LerOutroNome([byte[]] $san, [byte] $ultimo) {
  $oid = [byte[]](0x06, 0x05, 0x60, 0x4C, 0x01, 0x03, $ultimo)
  for ($i = 0; $i -le $san.Length - $oid.Length; $i++) {
    $achou = $true
    for ($j = 0; $j -lt $oid.Length; $j++) { if ($san[$i + $j] -ne $oid[$j]) { $achou = $false; break } }
    if (-not $achou) { continue }
    $k = $i + $oid.Length
    if ($san[$k] -ne 0xA0) { return $null }            # [0] EXPLICIT
    $k += 2
    $tamanho = $san[$k + 1]                             # tag do valor (OCTET/Printable/UTF8) + tamanho
    $k += 2
    if ($k + $tamanho -gt $san.Length) { return $null }
    return [Text.Encoding]::ASCII.GetString($san, $k, $tamanho)
  }
  $null
}

function LerDocumento($cert) {
  $san = $cert.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' } | Select-Object -First 1
  if ($san) {
    $cnpj = LerOutroNome $san.RawData 3
    if ($cnpj) { $d = ($cnpj -replace '\D', ''); if ($d.Length -ge 14) { return @{ Tipo = 'CNPJ'; Numero = $d.Substring(0, 14) } } }
    $pf = LerOutroNome $san.RawData 1                   # nascimento (8) + CPF (11) + ...
    if ($pf) { $d = ($pf -replace '\D', ''); if ($d.Length -ge 19) { return @{ Tipo = 'CPF'; Numero = $d.Substring(8, 11) } } }
  }
  $cn = $cert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  if ($cn -match ':(\d{14})\s*$') { return @{ Tipo = 'CNPJ'; Numero = $Matches[1] } }
  if ($cn -match ':(\d{11})\s*$') { return @{ Tipo = 'CPF'; Numero = $Matches[1] } }
  @{ Tipo = ''; Numero = '' }
}

function DataDasNotas([string] $notas) {
  if ($notas -match '(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})') {
    $ano = [int]$Matches[3]; if ($ano -lt 100) { $ano += 2000 }
    try { return (Get-Date -Year $ano -Month ([int]$Matches[2]) -Day ([int]$Matches[1])).Date } catch { }
  }
  $null
}

function ChamarCli([string[]] $argumentos) {
  # 2>&1 num executável, com ErrorActionPreference=Stop, vira exceção no PowerShell 5.1.
  $ErrorActionPreference = 'Continue'
  $saidaCli = $senhaDoCofre | & $cli @argumentos 2>&1
  if ($LASTEXITCODE -ne 0) { throw "keepassxc-cli falhou: $(($saidaCli | Out-String).Trim())" }
  $saidaCli
}

# ---------------------------------------------------------------- 1. ler o cofre

Write-Host 'Abrindo o cofre...'
$csv = (ChamarCli @('export', '-q', '-f', 'csv', '-k', $ArquivoChave, $Cofre) | ForEach-Object { "$_" }) -join "`n"
$entradas = @($csv | ConvertFrom-Csv)
$csv = $null

$raiz = ($entradas | Select-Object -First 1).Group -split '/' | Select-Object -First 1
$entradas = @($entradas | ForEach-Object {
  $grupo = ($_.Group -split '/', 2)
  [pscustomobject]@{
    Titulo   = $_.Title
    Caminho  = if ($grupo.Count -gt 1 -and $grupo[1]) { "$($grupo[1])/$($_.Title)" } else { $_.Title }
    Usuario  = $_.Username
    Senha    = $_.Password
    Notas    = $_.Notes
    Palavras = Normalizar $_.Title
    Arquivos = New-Object Collections.ArrayList
  }
})
Write-Host "  $($entradas.Count) entradas no cofre (grupo raiz: $raiz)."

$semSenha = @($entradas | Where-Object { -not $_.Senha })
$porSenha = New-Object Collections.Hashtable   # @{} ignora maiúsculas, e senha não
foreach ($e in ($entradas | Where-Object { $_.Senha })) {
  if (-not $porSenha.ContainsKey($e.Senha)) { $porSenha[$e.Senha] = New-Object Collections.ArrayList }
  [void]$porSenha[$e.Senha].Add($e)
}
Write-Host "  $($porSenha.Count) senhas diferentes; $($semSenha.Count) entradas sem senha."

# ---------------------------------------------------------------- 2. abrir cada certificado

$raizDaPasta = (Get-Item -LiteralPath $PastaCertificados).FullName.TrimEnd('\')
$arquivos = @(Get-ChildItem -LiteralPath $raizDaPasta -Recurse -File |
  Where-Object { $_.Extension -in '.pfx', '.p12' })
Write-Host "Conferindo $($arquivos.Count) certificados..."

$hoje = (Get-Date).Date
$linhas = New-Object Collections.ArrayList
$n = 0
foreach ($arq in $arquivos) {
  $n++
  Write-Progress -Activity 'Conferindo certificados' -Status $arq.Name -PercentComplete ($n / [Math]::Max($arquivos.Count, 1) * 100)
  $bytes = [IO.File]::ReadAllBytes($arq.FullName)
  $palavrasArquivo = Normalizar ([IO.Path]::GetFileNameWithoutExtension($arq.Name))

  # Primeiro as senhas das entradas cujo nome lembra o do arquivo — em geral abre na 1ª.
  $ordem = $porSenha.Keys | Sort-Object -Descending -Property {
    ($porSenha[$_] | ForEach-Object { Pontuar $_.Palavras $palavrasArquivo } | Measure-Object -Maximum).Maximum
  }

  $cert = $null; $senhaQueAbriu = $null
  $leitor = [SenhaDoPfx]::Ler($bytes)
  if ($leitor) {
    foreach ($s in $ordem) {
      if (-not $leitor.Confere($s)) { continue }
      $cert = AbrirCertificado $bytes $s
      if ($cert) { $senhaQueAbriu = $s; break }
    }
  } else {
    # Formato que o leitor rápido não entende: só as senhas mais prováveis, pelo Windows.
    foreach ($s in @($ordem | Select-Object -First $TentativasLentas)) {
      $cert = AbrirCertificado $bytes $s
      if ($cert) { $senhaQueAbriu = $s; break }
    }
  }

  $relativo = $arq.FullName.Substring($raizDaPasta.Length).TrimStart('\')
  # Na pasta da 41 o nome do arquivo traz a senha entre parênteses — EMPRESA (senha) 08.06.2027.pfx.
  # O relatório sai daqui e vai para outras mãos (e para a importação no Connect): mostra o nome
  # sem o trecho entre parênteses. O caminho inteiro só vai para as Notas do cofre, que é cifrado.
  $noRelatorio = $relativo -replace '\([^)]*\)', '(…)'
  if (-not $cert) {
    $motivo = if ($leitor) { 'SENHA NÃO ENCONTRADA' } else { 'FORMATO NÃO RECONHECIDO' }
    $obs = if ($leitor) { '' } else { "testadas só as $TentativasLentas senhas de nome mais parecido; abrir à mão" }
    [void]$linhas.Add([pscustomobject]@{
      Arquivo = $noRelatorio; Titular = ''; Tipo = ''; Documento = ''; Vencimento = ''; 'Dias para vencer' = ''
      'Situação' = $motivo; 'Entrada do cofre' = ''; Conferir = $obs; 'Vencimento no cofre' = ''
    })
    continue
  }

  $titular = ($cert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -split ':')[0].Trim()
  $doc = LerDocumento $cert
  $vence = $cert.NotAfter.Date
  $dias = ($vence - $hoje).Days

  # Várias entradas podem ter a mesma senha: fica a que tem o nome mais parecido com o titular.
  $palavrasTitular = Normalizar $titular
  $candidatas = @($porSenha[$senhaQueAbriu] | Sort-Object -Descending -Property { Pontuar $_.Palavras $palavrasTitular })
  $entrada = $candidatas[0]
  $pontos = Pontuar $entrada.Palavras $palavrasTitular

  $avisos = @()
  if ($pontos -eq 0) { $avisos += 'nome da entrada não lembra o titular' }
  if ($candidatas.Count -gt 1) {
    $empatadas = @($candidatas | Where-Object { (Pontuar $_.Palavras $palavrasTitular) -eq $pontos })
    if ($empatadas.Count -gt 1) { $avisos += "senha repetida em $($candidatas.Count) entradas" }
  }
  # Só a dúvida sobre QUAL entrada abriu o arquivo impede gravar o CNPJ; vencimento anotado
  # diferente é planilha desatualizada, e vai só como aviso.
  $seguro = ($avisos.Count -eq 0)
  # A planilha costuma anotar o último dia de validade, e o certificado vence no dia seguinte:
  # diferença de um ou dois dias é convenção, não erro. Só avisa o que destoa de verdade.
  $vencimentoCofre = DataDasNotas $entrada.Notas
  if ($vencimentoCofre -and [Math]::Abs(($vencimentoCofre - $vence).Days) -gt 2) {
    $avisos += "vencimento anotado difere em $([Math]::Abs(($vencimentoCofre - $vence).Days)) dias"
  }

  $situacao = if ($dias -lt 0) { 'VENCIDO' } elseif ($dias -le $DiasDeAviso) { 'VENCE LOGO' } else { 'OK' }

  [void]$entrada.Arquivos.Add([pscustomobject]@{ Relativo = $relativo; Documento = $doc.Numero; Vence = $vence; Seguro = $seguro })
  [void]$linhas.Add([pscustomobject]@{
    Arquivo = $noRelatorio; Titular = $titular; Tipo = $doc.Tipo; Documento = $doc.Numero
    Vencimento = $vence.ToString('dd/MM/yyyy'); 'Dias para vencer' = $dias; 'Situação' = $situacao
    'Entrada do cofre' = $entrada.Titulo; Conferir = ($avisos -join '; ')
    'Vencimento no cofre' = if ($vencimentoCofre) { $vencimentoCofre.ToString('dd/MM/yyyy') } else { '' }
  })
  $cert.Reset()
}
Write-Progress -Activity 'Conferindo certificados' -Completed

# ---------------------------------------------------------------- 3. relatório (sem senhas, nem a do nome do arquivo)

New-Item -ItemType Directory -Force -Path $Saida | Out-Null
$arqRelatorio = Join-Path $Saida 'certificados.csv'
$arqSobras = Join-Path $Saida 'entradas-sem-certificado.csv'
$linhas | Sort-Object 'Situação', Arquivo | Export-Csv -LiteralPath $arqRelatorio -Delimiter ';' -Encoding UTF8 -NoTypeInformation

$sobras = @($entradas | Where-Object { $_.Arquivos.Count -eq 0 } | ForEach-Object {
  [pscustomobject]@{
    'Entrada do cofre' = $_.Titulo
    Motivo = if (-not $_.Senha) { 'entrada sem senha' } else { 'a senha não abriu nenhum certificado da pasta' }
  }
})
$sobras | Export-Csv -LiteralPath $arqSobras -Delimiter ';' -Encoding UTF8 -NoTypeInformation

$contagem = $linhas | Group-Object 'Situação' | ForEach-Object { "$($_.Count) $($_.Name)" }
Write-Host ''
Write-Host "Certificados: $($contagem -join ' · ')"
Write-Host "Para conferir à mão: $(@($linhas | Where-Object { $_.Conferir }).Count)"
Write-Host "Entradas do cofre sem certificado: $($sobras.Count)"
Write-Host "Relatório: $arqRelatorio"
Write-Host "           $arqSobras"

# ---------------------------------------------------------------- 4. gravar o CNPJ no cofre (opcional)

if ($Gravar) {
  $contagemCaminho = $entradas | Group-Object Caminho -AsHashTable
  $aGravar = @()
  foreach ($e in $entradas) {
    if ($e.Arquivos.Count -eq 0) { continue }
    $atual = $e.Arquivos | Sort-Object Vence -Descending | Select-Object -First 1   # o mais novo, se renovou
    $docs = @($e.Arquivos | Where-Object { $_.Documento } | Select-Object -ExpandProperty Documento -Unique)
    if (-not $atual.Seguro -or -not $atual.Documento) { continue }
    if ($docs.Count -gt 1) { Write-Host "  pulado (arquivos de documentos diferentes): $($e.Titulo)"; continue }
    if ($e.Titulo -match '/' -or $contagemCaminho[$e.Caminho].Count -gt 1) { Write-Host "  pulado (título repetido ou com '/'): $($e.Titulo)"; continue }
    $notaArquivo = "Arquivo: $($atual.Relativo)"
    if ($e.Usuario -eq $atual.Documento -and "$($e.Notas)" -like "*$notaArquivo*") { continue }
    $notas = (@("$($e.Notas)".Trim(), $notaArquivo) | Where-Object { $_ }) -join ' · '
    $aGravar += [pscustomobject]@{ Entrada = $e; Documento = $atual.Documento; Notas = ($notas -replace '"', "'") }
  }

  if ($aGravar.Count -eq 0) {
    Write-Host 'Nada a gravar no cofre.'
  } else {
    Write-Host ''
    Write-Host "Vou gravar o CNPJ/CPF no campo Usuário de $($aGravar.Count) entradas. Feche o KeePassXC antes."
    if ((Read-Host 'Digite SIM para continuar') -ne 'SIM') { Write-Host 'Cancelado; o cofre não foi alterado.' }
    else {
      $copia = "$Cofre.antes-da-conferencia-$(Get-Date -Format 'yyyyMMdd-HHmm').kdbx"
      Copy-Item -LiteralPath $Cofre -Destination $copia
      Write-Host "Cópia do cofre: $copia"
      $i = 0
      foreach ($g in $aGravar) {
        $i++
        Write-Progress -Activity 'Gravando no cofre' -Status $g.Entrada.Titulo -PercentComplete ($i / $aGravar.Count * 100)
        ChamarCli @('edit', '-q', '-k', $ArquivoChave, '-u', $g.Documento, '--notes', $g.Notas, $Cofre, $g.Entrada.Caminho) | Out-Null
      }
      Write-Progress -Activity 'Gravando no cofre' -Completed
      Write-Host "Gravadas $i entradas."
    }
  }
}

$senhaDoCofre = $null
$porSenha.Clear(); $entradas = $null
[GC]::Collect()
