using System.Security.Cryptography.X509Certificates;
using System.Security.Cryptography.Xml;
using System.Xml;

namespace Assinador;

/// <summary>
/// A assinatura dos XML do eSocial, como o Manual do Desenvolvedor (v1.16, 6.7) pede:
/// XMLDSig enveloped, RSA-SHA256, digest SHA-256, C14N, Reference URI="" e só o
/// certificado do usuário final no KeyInfo.
/// </summary>
internal static class AssinaturaXml
{
    public static XmlDocument Assinar(string xml, X509Certificate2 certificado)
    {
        var doc = new XmlDocument { PreserveWhitespace = true };
        doc.LoadXml(xml);
        Assinar(doc, certificado);
        return doc;
    }

    public static void Assinar(XmlDocument doc, X509Certificate2 certificado)
    {
        var chave = certificado.GetRSAPrivateKey() ?? throw new InvalidOperationException("O certificado não tem chave RSA acessível.");
        var assinado = new SignedXml(doc) { SigningKey = chave };
        assinado.SignedInfo!.CanonicalizationMethod = SignedXml.XmlDsigC14NTransformUrl;
        assinado.SignedInfo.SignatureMethod = SignedXml.XmlDsigRSASHA256Url;

        var referencia = new Reference("") { DigestMethod = SignedXml.XmlDsigSHA256Url };
        referencia.AddTransform(new XmlDsigEnvelopedSignatureTransform());
        referencia.AddTransform(new XmlDsigC14NTransform());
        assinado.AddReference(referencia);

        var info = new KeyInfo();
        info.AddClause(new KeyInfoX509Data(certificado, X509IncludeOption.EndCertOnly));
        assinado.KeyInfo = info;

        assinado.ComputeSignature();
        doc.DocumentElement!.AppendChild(doc.ImportNode(assinado.GetXml(), true));
    }

    /// <summary>Confere a assinatura com a chave pública do certificado que vai no próprio XML.</summary>
    public static bool Conferir(XmlDocument doc)
    {
        var nos = doc.GetElementsByTagName("Signature", SignedXml.XmlDsigNamespaceUrl);
        if (nos.Count != 1) return false;
        var assinado = new SignedXml(doc);
        assinado.LoadXml((XmlElement)nos[0]!);
        return assinado.CheckSignature();
    }
}
