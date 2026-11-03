/**
 * Módulo 10 — provedor do avatar da live (`LIVE_AVATAR_PROVIDER=mock`). O mock não usa imagem nem voz de ninguém: são
 * apresentadores PRÉ-PRONTOS (sintéticos). Avatar com a imagem/voz do lojista (`source: 'custom'`) só com consentimento
 * `avatar_live` ativo — conferido no serviço antes de chegar aqui. Saída: falas do apresentador por produto.
 */
export const AVATAR_PRESETS = ['ana', 'leo', 'bia'] as const;
export type AvatarPreset = (typeof AVATAR_PRESETS)[number];
export interface ScriptItem { name: string; price: number }
const fmt = (n: number, loc: string) => new Intl.NumberFormat(loc === 'en' ? 'en-US' : loc === 'es' ? 'es-MX' : 'pt-BR', { style: 'currency', currency: loc === 'en' ? 'USD' : loc === 'es' ? 'MXN' : 'BRL' }).format(n);
const LINES = {
  'pt-BR': (i: ScriptItem, l: string) => `Olha que demais: ${i.name} por ${fmt(i.price, l)}. Toque no produto para comprar.`,
  en: (i: ScriptItem, l: string) => `Check this out: ${i.name} for ${fmt(i.price, l)}. Tap the product to buy.`,
  es: (i: ScriptItem, l: string) => `Mira esto: ${i.name} por ${fmt(i.price, l)}. Toca el producto para comprar.`,
} as const;
export const mockAvatar = {
  name: 'mock',
  script(items: ScriptItem[], locale: string): Array<{ index: number; line: string }> {
    const f = LINES[(locale in LINES ? locale : 'pt-BR') as keyof typeof LINES];
    return items.slice(0, 50).map((it, index) => ({ index, line: f(it, locale) }));
  },
};
