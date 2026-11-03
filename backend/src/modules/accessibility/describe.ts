/**
 * Módulo 11 — audiodescrição: descreve o que aparece em cada cena (provedor `mock`, local) e PASSA PELO FILTRO de dados
 * sensíveis antes de qualquer pessoa ver o texto. Regras ("não revela informação sensível"):
 * - remove contatos e documentos (e-mail, telefone, CPF/CNPJ, cartão, URL, @perfil, placa de carro);
 * - não atribui características sensíveis a pessoas (origem étnica/racial, religião, saúde, deficiência, orientação sexual,
 *   gravidez, opinião política, idade estimada) — o trecho é trocado por "[omitido]";
 * - descreve só o que é visual e relevante (produto, ação, ambiente), em frases curtas.
 * Nada vai para exportação antes de revisão humana (status `pending_review` → aprovar).
 */
export interface SceneIn { index: number; text: string; prompt: string; referenceMode: string; durationMs: number }
const PII: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[omitido]'], [/https?:\/\/\S+|www\.\S+/gi, '[omitido]'], [/(^|\s)@[\w.]{2,}/g, '$1[omitido]'],
  [/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[omitido]'], [/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[omitido]'], [/\b(?:\d[ -]?){13,19}\b/g, '[omitido]'],
  [/(?:\+?\d{2}\s?)?\(?\d{2}\)?\s?9?\d{4}[- ]?\d{4}\b/g, '[omitido]'], [/\b[A-Z]{3}-?\d[A-Z0-9]\d{2}\b/g, '[omitido]'],
];
const SENSITIVE = /\b(negr[oa]s?|branc[oa]s? de pele|pard[oa]s?|asi[aá]tic[oa]s?|ind[ií]gena|etnia|ra[cç]a|judeu|judia|mu[cç]ulman[oa]|cat[oó]lic[oa]|evang[eé]lic[oa]|religi[aã]o|religios[oa]|gay|l[eé]sbica|trans(?:g[eê]nero)?|homossexual|bissexual|gr[aá]vida|gestante|doente|c[aâ]ncer|hiv|deficien(?:te|cia)|cadeirante|autista|obes[oa]|pol[ií]tic[oa]|partid[aá]ri[oa]|esquerdista|direitista|idos[oa]|\d{1,3}\s?anos de idade|black|white-skinned|latin[oa]|jewish|muslim|christian|religion|pregnant|disabled|wheelchair|sick|gay|lesbian|elderly|ethnic(?:ity)?|race|embarazad[ao]|discapacitad[oa]|enferm[oa]|anciano|religi[oó]n)\b/gi;
export function sanitize(text: string): { text: string; redactions: number } {
  let n = 0; let t = text;
  for (const [re, rep] of PII) t = t.replace(re, (...m) => { n++; return typeof rep === 'string' && rep.startsWith('$1') ? (m[1] as string) + '[omitido]' : rep; });
  t = t.replace(SENSITIVE, () => { n++; return '[omitido]'; });
  return { text: t.replace(/\s+/g, ' ').replace(/(\[omitido\]\s*){2,}/g, '[omitido] ').trim(), redactions: n };
}
const OPEN = { 'pt-BR': ['Em destaque', 'Close em', 'Mostra', 'Aparece'], en: ['Featured', 'Close-up of', 'Shows', 'On screen'], es: ['Destacado', 'Primer plano de', 'Muestra', 'Aparece'] } as const;
const PERSON = { 'pt-BR': 'uma pessoa', en: 'a person', es: 'una persona' } as const;
/** Provedor mock: descrição visual a partir do prompt da cena (o que foi pedido para aparecer), curta e sem atributos pessoais. */
export function describeScene(s: SceneIn, locale: 'pt-BR' | 'en' | 'es'): string {
  const base = (s.prompt || s.text || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  const who = s.referenceMode === 'person' || s.referenceMode === 'both' ? ` ${PERSON[locale]}` : '';
  const head = OPEN[locale][s.index % OPEN[locale].length]; const body = base.length > 110 ? base.slice(0, 109).trimEnd() + '…' : base;
  return `${head}${who}: ${body || '—'}${body.endsWith('…') ? '' : '.'}`;
}
