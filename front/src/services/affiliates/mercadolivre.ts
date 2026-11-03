/** Mercado Livre Afiliados – gera link com tag de afiliado. TODO: integrar com API oficial (programa de afiliados; hoje a geração em massa é restrita). */
export async function generateAffiliateLink(productUrl: string, affiliateId: string): Promise<string> {
  // TODO: integrar com API oficial. Placeholder: acrescenta parâmetro de campanha.
  const u = new URL(productUrl); u.searchParams.set('matt_tool', affiliateId); return u.toString();
}
