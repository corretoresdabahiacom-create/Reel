/** Shopee Afiliados – gera link curto de afiliado. TODO: integrar com API oficial (Shopee Affiliate Open API, GraphQL; credenciais AppID/Secret exigem conta de afiliado aprovada). */
export async function generateAffiliateLink(productUrl: string, _token: string): Promise<string> {
  // TODO: integrar com API oficial (mutation generateShortLink).
  const code = Buffer.from(productUrl).toString('base64url').slice(0, 8);
  return `https://s.shopee.com.br/${code}`;
}
