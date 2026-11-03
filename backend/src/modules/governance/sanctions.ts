/**
 * Triagem de sanções (OFAC/UE/ONU). Provedor `stub`: lista LOCAL DE DEMONSTRAÇÃO + similaridade (Jaro-Winkler) — NÃO substitui as listas oficiais.
 * Em produção: provedor real (OpenSanctions/ComplyAdvantage/Persona watchlists) atrás da mesma interface; o registro em `sanctions_checks` é o mesmo.
 */
export interface SanctionsHit { listSource: string; entity: string; score: number }
export interface SanctionsProvider { screen(name: string): Promise<SanctionsHit[]> }
export const DEMO_LIST: Array<{ list: string; name: string }> = [{ list: 'DEMO-OFAC-SDN', name: 'Ivan Petrovich Sanctionov' }, { list: 'DEMO-EU', name: 'Marta Listada Exemplo' }, { list: 'DEMO-UN', name: 'Acme Sanctioned Trading Ltd' }];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1; if (!a.length || !b.length) return 0; const md = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1); const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false); let m = 0;
  for (let i = 0; i < a.length; i++) for (let j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++) if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
  if (!m) return 0; let t = 0, k = 0; for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3; let l = 0; while (l < 4 && a[l] === b[l]) l++; return jaro + l * 0.1 * (1 - jaro);
}
export const THRESHOLD = 0.92;
export class StubSanctions implements SanctionsProvider { constructor(private list = DEMO_LIST) {} async screen(name: string): Promise<SanctionsHit[]> { const n = norm(name); return this.list.map((e) => ({ listSource: e.list, entity: e.name, score: +jaroWinkler(n, norm(e.name)).toFixed(4) })).filter((h) => h.score >= THRESHOLD); } }
let provider: SanctionsProvider = new StubSanctions(); export const sanctionsProvider = () => provider; export const setSanctionsProvider = (p: SanctionsProvider) => { provider = p; };
