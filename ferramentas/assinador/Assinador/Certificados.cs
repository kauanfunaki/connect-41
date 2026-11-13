using System.Formats.Asn1;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace Assinador;

/// <summary>Um certificado do Windows, como o Connect enxerga.</summary>
internal sealed record CertificadoNoWindows(string Thumbprint, string Nome, string? Documento, DateTime ValidoAte, bool ChaveAcessivel);

/// <summary>
/// Os certificados do repositório pessoal do Windows (CurrentUser\My), onde o
/// CertDigital põe o certificado enquanto está "ligado".
/// </summary>
internal static class Certificados
{
    public static List<CertificadoNoWindows> Listar()
    {
        using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
        var agora = DateTime.Now;
        var lista = new List<CertificadoNoWindows>();
        foreach (var c in store.Certificates)
        {
            if (!c.HasPrivateKey || c.NotAfter < agora || c.NotBefore > agora) continue;
            lista.Add(new CertificadoNoWindows(c.Thumbprint, NomeDe(c), Documento(c), c.NotAfter, ChaveAcessivel(c)));
        }
        return lista.OrderByDescending(x => x.ChaveAcessivel).ThenBy(x => x.Nome).ToList();
    }

    /// <summary>
    /// O certificado para falar com o eSocial: o pedido pelo thumbprint ou, sem ele,
    /// o da própria empresa (mesma raiz de CNPJ). Só os de chave acessível.
    /// </summary>
    public static X509Certificate2 Escolher(string? thumbprint, string cnpjDaEmpresa)
    {
        using var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
        store.Open(OpenFlags.ReadOnly | OpenFlags.OpenExistingOnly);
        var agora = DateTime.Now;
        var validos = store.Certificates.Cast<X509Certificate2>()
            .Where(c => c.HasPrivateKey && c.NotAfter >= agora && c.NotBefore <= agora && ChaveAcessivel(c))
            .ToList();
        if (!string.IsNullOrWhiteSpace(thumbprint))
        {
            var t = validos.FirstOrDefault(c => string.Equals(c.Thumbprint, thumbprint.Replace(" ", ""), StringComparison.OrdinalIgnoreCase));
            return t ?? throw new ErroParaOConnect("O certificado escolhido não está ligado neste computador. Ligue-o no CertDigital e tente de novo.");
        }
        var raiz = Digitos(cnpjDaEmpresa);
        raiz = raiz.Length >= 8 ? raiz[..8] : raiz;
        var daEmpresa = validos.FirstOrDefault(c => Documento(c) is { Length: 14 } d && d.StartsWith(raiz, StringComparison.Ordinal));
        return daEmpresa ?? throw new ErroParaOConnect("Nenhum certificado desta empresa está ligado. Ligue o certificado da empresa no CertDigital ou escolha o do escritório.");
    }

    internal static string NomeDe(X509Certificate2 c)
    {
        var cn = c.GetNameInfo(X509NameType.SimpleName, false);
        return string.IsNullOrWhiteSpace(cn) ? c.Subject : cn;
    }

    /// <summary>
    /// CNPJ (e-CNPJ) ou CPF (e-CPF) do titular. ICP-Brasil guarda no
    /// SubjectAltName (otherName 2.16.76.1.3.3 = CNPJ; 2.16.76.1.3.1 = nascimento +
    /// CPF); muitos também trazem no CN, depois dos dois-pontos ("EMPRESA:12345678000199").
    /// </summary>
    internal static string? Documento(X509Certificate2 c)
    {
        try
        {
            var san = c.Extensions["2.5.29.17"];
            if (san is not null)
            {
                var doSan = DoSubjectAltName(san.RawData);
                if (doSan is not null) return doSan;
            }
        }
        catch
        {
            // SAN fora do padrão: tenta o CN.
        }
        var cn = c.GetNameInfo(X509NameType.SimpleName, false) ?? "";
        var depois = cn.Contains(':') ? Digitos(cn[(cn.LastIndexOf(':') + 1)..]) : "";
        return depois.Length is 11 or 14 ? depois : null;
    }

    private static string? DoSubjectAltName(byte[] raw)
    {
        var leitor = new AsnReader(raw, AsnEncodingRules.DER);
        var nomes = leitor.ReadSequence();
        string? cpf = null;
        while (nomes.HasData)
        {
            var tag = nomes.PeekTag();
            if (tag.TagClass == TagClass.ContextSpecific && tag.TagValue == 0)
            {
                var outro = nomes.ReadSequence(new Asn1Tag(TagClass.ContextSpecific, 0, true));
                var oid = outro.ReadObjectIdentifier();
                var valor = outro.ReadSequence(new Asn1Tag(TagClass.ContextSpecific, 0, true));
                var texto = LerTexto(valor);
                if (oid == "2.16.76.1.3.3" && Digitos(texto).Length == 14) return Digitos(texto);
                if (oid == "2.16.76.1.3.1" && Digitos(texto).Length >= 19) cpf = Digitos(texto).Substring(8, 11);
            }
            else
            {
                nomes.ReadEncodedValue();
            }
        }
        return cpf;
    }

    private static string LerTexto(AsnReader r)
    {
        var tag = r.PeekTag();
        if (tag.HasSameClassAndValue(Asn1Tag.PrimitiveOctetString)) return Encoding.ASCII.GetString(r.ReadOctetString());
        if (tag.TagClass == TagClass.Universal)
        {
            return (UniversalTagNumber)tag.TagValue switch
            {
                UniversalTagNumber.PrintableString => r.ReadCharacterString(UniversalTagNumber.PrintableString),
                UniversalTagNumber.UTF8String => r.ReadCharacterString(UniversalTagNumber.UTF8String),
                UniversalTagNumber.IA5String => r.ReadCharacterString(UniversalTagNumber.IA5String),
                _ => Encoding.ASCII.GetString(r.ReadEncodedValue().ToArray()),
            };
        }
        return Encoding.ASCII.GetString(r.ReadEncodedValue().ToArray());
    }

    internal static string Digitos(string? s) => new((s ?? "").Where(char.IsAsciiDigit).ToArray());

    // ─── A chave abre sem pedir nada? ──────────────────────────────────────

    private const uint CRYPT_ACQUIRE_SILENT_FLAG = 0x40;
    private const uint CRYPT_ACQUIRE_ALLOW_NCRYPT_KEY_FLAG = 0x10000;
    private const uint CERT_NCRYPT_KEY_SPEC = 0xFFFFFFFF;
    private const int NTE_SILENT_CONTEXT = unchecked((int)0x80090022);

    [DllImport("crypt32.dll", SetLastError = true)]
    private static extern bool CryptAcquireCertificatePrivateKey(IntPtr pCert, uint dwFlags, IntPtr pvParameters, out IntPtr phCryptProvOrNCryptKey, out uint pdwKeySpec, out bool pfCallerFreeProvOrNCryptKey);

    [DllImport("ncrypt.dll")]
    private static extern int NCryptFreeObject(IntPtr hObject);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool CryptReleaseContext(IntPtr hProv, uint dwFlags);

    /// <summary>
    /// Um certificado desligado no CertDigital pode continuar listado no Windows;
    /// só abrir a chave, sem interface, prova que dá para assinar. NTE_SILENT_CONTEXT
    /// quer dizer que a chave existe e vai pedir o PIN (token A3): conta como acessível.
    /// </summary>
    internal static bool ChaveAcessivel(X509Certificate2 c)
    {
        if (!OperatingSystem.IsWindows()) return c.HasPrivateKey;
        if (!CryptAcquireCertificatePrivateKey(c.Handle, CRYPT_ACQUIRE_SILENT_FLAG | CRYPT_ACQUIRE_ALLOW_NCRYPT_KEY_FLAG, IntPtr.Zero, out var h, out var spec, out var liberar))
        {
            return Marshal.GetLastWin32Error() == NTE_SILENT_CONTEXT || Marshal.GetLastPInvokeError() == NTE_SILENT_CONTEXT;
        }
        if (liberar && h != IntPtr.Zero)
        {
            if (spec == CERT_NCRYPT_KEY_SPEC) NCryptFreeObject(h);
            else CryptReleaseContext(h, 0);
        }
        return true;
    }
}

/// <summary>Um erro com texto para mostrar ao DP, sem detalhe técnico.</summary>
internal sealed class ErroParaOConnect(string mensagem) : Exception(mensagem);
