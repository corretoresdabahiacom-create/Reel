/** Geração de postmortem blameless a partir da linha do tempo (updates + eventos externos PagerDuty/Slack). Sempre rascunho: exige revisão humana. */
export interface TimelineEvent { at: string; source: string; text: string }
export interface IncidentLike { id: string; severity: string; title: string; started_at: string | Date; detected_at?: string | Date | null; mitigated_at?: string | Date | null; resolved_at?: string | Date | null; components?: string[]; impact_summary?: string | null }
const t = (d: string | Date | null | undefined) => (d ? new Date(d).getTime() : null);
const mins = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.max(0, Math.round((b - a) / 60000)));
export function addBusinessDays(from: Date, n: number): Date { const d = new Date(from); let left = n; while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; } return d; }
export function metrics(i: Pick<IncidentLike, 'started_at' | 'detected_at' | 'mitigated_at' | 'resolved_at'>) { const s = t(i.started_at), d = t(i.detected_at ?? null), m = t(i.mitigated_at ?? null), r = t(i.resolved_at ?? null); return { mttdMin: mins(s, d), ttmMin: mins(s, m), mttrMin: mins(s, r), durationMin: mins(s, r) }; }
export function buildPostmortem(i: IncidentLike, updates: Array<{ created_at: string | Date; message: string; status: string }>, external: TimelineEvent[] = []) {
  const timeline: TimelineEvent[] = [
    { at: new Date(i.started_at).toISOString(), source: 'incident', text: `Início do incidente (${i.severity}): ${i.title}` },
    ...(i.detected_at ? [{ at: new Date(i.detected_at).toISOString(), source: 'incident', text: 'Detecção' }] : []),
    ...updates.map((u) => ({ at: new Date(u.created_at).toISOString(), source: 'update', text: `[${u.status}] ${u.message}` })),
    ...external,
    ...(i.mitigated_at ? [{ at: new Date(i.mitigated_at).toISOString(), source: 'incident', text: 'Mitigado' }] : []),
    ...(i.resolved_at ? [{ at: new Date(i.resolved_at).toISOString(), source: 'incident', text: 'Resolvido' }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const mt = metrics(i); const actions: Array<{ title: string; owner: string; dueInDays: number; type: string }> = [];
  if (mt.mttdMin !== null && mt.mttdMin > 10) actions.push({ title: `Reduzir tempo de detecção (${mt.mttdMin} min): criar/ajustar alerta de burn rate para o componente afetado`, owner: 'sre', dueInDays: 14, type: 'detect' });
  if (mt.ttmMin !== null && mt.ttmMin > 60) actions.push({ title: `Reduzir tempo de mitigação (${mt.ttmMin} min): automatizar a mitigação (feature flag/failover) ou atualizar runbook`, owner: 'on-call-team', dueInDays: 21, type: 'mitigate' });
  actions.push({ title: 'Revisar runbook do(s) componente(s) afetado(s) com o aprendizado deste incidente', owner: 'service-owner', dueInDays: 7, type: 'document' }, { title: 'Adicionar teste/chaos experiment que reproduza a falha', owner: 'sre', dueInDays: 30, type: 'prevent' });
  return {
    root_cause: null as string | null, // preenchido na revisão humana — nunca inventado
    timeline, five_whys: [1, 2, 3, 4, 5].map((n) => ({ why: n, answer: '' })), actions_json: actions,
    impact_summary: i.impact_summary ?? `Componentes afetados: ${(i.components ?? []).join(', ') || 'n/d'}. Duração: ${mt.durationMin ?? 'em andamento'} min.`, metrics: mt,
    markdown: renderMarkdown(i, timeline, mt, actions),
  };
}
export function renderMarkdown(i: IncidentLike, timeline: TimelineEvent[], mt: ReturnType<typeof metrics>, actions: Array<{ title: string; owner: string; dueInDays: number }>): string {
  return `# Postmortem — ${i.title}\n\n> Rascunho gerado automaticamente. **Revisão humana obrigatória** antes de publicar. Formato blameless: foco em sistemas e processos, não em pessoas.\n\n- Severidade: ${i.severity}\n- Componentes: ${(i.components ?? []).join(', ') || 'n/d'}\n- MTTD: ${mt.mttdMin ?? 'n/d'} min · Tempo até mitigação: ${mt.ttmMin ?? 'n/d'} min · MTTR: ${mt.mttrMin ?? 'n/d'} min\n\n## Impacto\n${i.impact_summary ?? '_preencher_'}\n\n## Linha do tempo (UTC)\n${timeline.map((e) => `- ${e.at} (${e.source}) — ${e.text}`).join('\n')}\n\n## Causa raiz (5 porquês)\n_preencher na revisão_\n\n## O que funcionou / o que não funcionou\n_preencher_\n\n## Ações corretivas\n${actions.map((a) => `- [ ] ${a.title} — dono: ${a.owner}, prazo: ${a.dueInDays} dias`).join('\n')}\n`;
}
