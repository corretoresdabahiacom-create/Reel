import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { boot, shutdown, http, signup, auth, pool, uploadPhoto, type Session } from './helpers.js';

/**
 * Auditoria (pós-Fase 8): IDOR e exposição de dados.
 * B tenta ler/alterar cada recurso de A por ID; nenhuma resposta pode ser 2xx nem conter dados de A.
 * Também verifica que respostas nunca carregam campos sensíveis (hash de senha, segredos TOTP, tokens cifrados, e-mail de terceiros).
 */
const SENSITIVE = /password_hash|passwordHash|totp_secret|totpSecret|token_enc|tokenEnc|access_token|refresh_token|key_hash|keyHash|argon2|v1:k1:/;
let a: Session; let b: Session; const ids: Record<string, string> = {};

beforeAll(async () => {
  await boot(false);
  a = await signup({ plan: 'business', credits: 500 }); b = await signup({ plan: 'business', credits: 500 });
  const photo = await uploadPhoto(a);
  const p = await http.post('/api/v1/projects').set(auth(a)).send({ title: 'Projeto secreto de A', script: 'Roteiro confidencial de A. Cena dois. Cena três.', photos: [photo] }); expect(p.status).toBe(201); ids.project = p.body.id;
  await pool.query(`INSERT INTO scenes (project_id, index, text, duration_sec, prompt, status) VALUES ($1, 0, 'cena', 8, 'p', 'pending')`, [ids.project]).catch(() => undefined);
  ids.scene = (await pool.query(`SELECT id FROM scenes WHERE project_id=$1 ORDER BY index LIMIT 1`, [ids.project])).rows[0]?.id ?? '00000000-0000-4000-8000-000000000000';
  const c = await http.post('/api/v1/catalogs').set(auth(a)).send({ name: 'Catálogo de A' }); expect(c.status).toBe(201); ids.catalog = c.body.id;
  const k = await http.post('/api/v1/api-keys').set(auth(a)).send({ name: 'ERP de A', scopes: ['catalogs:read'] }); expect(k.status).toBe(201); ids.apiKey = k.body.id;
  const t = await http.post('/api/v1/templates').set(auth(a)).send({ name: 'Template de A', description: 'rascunho privado', category: 'ecommerce', priceCredits: 10, sceneStructure: [{ text: 'a', durationSec: 8 }] });
  ids.template = t.body.id ?? (await pool.query(`INSERT INTO templates (creator_id, name, moderation_status) VALUES ($1, 'Template de A', 'pending') RETURNING id`, [a.id])).rows[0].id;
  ids.publication = (await pool.query(`INSERT INTO publications (project_id, user_id, platform, status, error) VALUES ($1, $2, 'tiktok', 'failed', 'falha') RETURNING id`, [ids.project, a.id])).rows[0].id;
  ids.link = (await pool.query(`INSERT INTO affiliate_links (user_id, platform, original_url, tracking_url) VALUES ($1, 'shopee', 'https://shopee.com.br/x', 'https://r.test/x') RETURNING id`, [a.id])).rows[0].id;
  ids.batch = (await pool.query(`INSERT INTO batch_jobs (owner_id, type, catalog_id, status) VALUES ($1, 'generation', $2, 'running') RETURNING id`, [a.id, ids.catalog])).rows[0].id;
  ids.export = (await pool.query(`INSERT INTO data_export_requests (user_id, status, storage_key) VALUES ($1, 'completed', 'exports/a.json') RETURNING id`, [a.id])).rows[0].id;
  ids.notification = (await pool.query(`INSERT INTO notifications (user_id, channel, title, body) VALUES ($1, 'push', 'Olá A', 'mensagem privada') RETURNING id`, [a.id])).rows[0].id;
});
afterAll(shutdown);

describe('20. Auditoria — IDOR e exposição de dados', () => {
  it('controle positivo: A lê os próprios recursos (garante que a sonda não é vazia)', async () => {
    expect(ids.scene).not.toBe('00000000-0000-4000-8000-000000000000');
    for (const url of [`/api/v1/projects/${ids.project}`, `/api/v1/catalogs/${ids.catalog}`, `/api/v1/batch-jobs/${ids.batch}`, `/api/v1/publications/${ids.publication}`, `/api/v1/affiliates/links/${ids.link}/stats`, `/api/v1/projects/${ids.project}/generation-logs`, `/api/v1/templates/${ids.template}`]) {
      const r = await http.get(url).set(auth(a)); expect([url, r.status]).toEqual([url, 200]);
    }
    const keys = await http.get('/api/v1/api-keys').set(auth(a)); expect(JSON.stringify(keys.body)).toContain(ids.apiKey);
    const notes = await http.get('/api/v1/notifications').set(auth(a)); expect(JSON.stringify(notes.body)).toContain(ids.notification);
  });

  it('B não acessa nenhum recurso de A por ID (leitura, escrita e ações)', async () => {
    const P = ids.project; const S = ids.scene;
    const probes: Array<[string, string, Record<string, unknown>?]> = [
      ['get', `/api/v1/projects/${P}`], ['patch', `/api/v1/projects/${P}`, { title: 'hack' }], ['delete', `/api/v1/projects/${P}`],
      ['get', `/api/v1/projects/${P}/generation-logs`], ['get', `/api/v1/projects/${P}/localized-versions`],
      ['post', `/api/v1/projects/${P}/storyboard`, {}], ['post', `/api/v1/projects/${P}/assemble`, {}], ['post', `/api/v1/projects/${P}/dub`, { locales: ['en'] }],
      ['patch', `/api/v1/projects/${P}/scenes/${S}`, { text: 'hack' }], ['post', `/api/v1/projects/${P}/scenes/${S}/generate`, {}], ['post', `/api/v1/projects/${P}/scenes/${S}/regenerate`, {}],
      ['get', `/api/v1/catalogs/${ids.catalog}`], ['delete', `/api/v1/catalogs/${ids.catalog}`], ['post', `/api/v1/catalogs/${ids.catalog}/items`, { items: [{ sku: 'x', name: 'x', priceCents: 100 }] }],
      ['post', `/api/v1/catalogs/${ids.catalog}/batch-generate`, {}], ['post', `/api/v1/catalogs/${ids.catalog}/batch-publish`, { platforms: ['tiktok'] }],
      ['get', `/api/v1/batch-jobs/${ids.batch}`], ['post', `/api/v1/batch-jobs/${ids.batch}/cancel`, {}],
      ['delete', `/api/v1/api-keys/${ids.apiKey}`],
      ['patch', `/api/v1/templates/${ids.template}`, { name: 'hack' }], ['delete', `/api/v1/templates/${ids.template}`], ['get', `/api/v1/templates/${ids.template}`],
      ['get', `/api/v1/publications/${ids.publication}`], ['post', `/api/v1/publications/${ids.publication}/retry`, {}],
      ['get', `/api/v1/affiliates/links/${ids.link}/stats`],
      ['get', `/api/v1/users/me/export/${ids.export}`],
      ['post', `/api/v1/notifications/${ids.notification}/action`, { action: 'open' }],
      ['get', `/api/v1/growth/share/${P}`], ['get', `/api/v1/growth/share/${P}/card.svg`],
    ];
    const leaks: string[] = [];
    for (const [m, url, body] of probes) {
      const req = (http as unknown as Record<string, (u: string) => import('supertest').Test>)[m](url).set(auth(b)); const r = body ? await req.send(body) : await req;
      const text = JSON.stringify(r.body ?? '') + (r.text ?? '');
      if (r.status < 400 || /Projeto secreto de A|Roteiro confidencial|Catálogo de A|ERP de A|mensagem privada|rascunho privado/.test(text)) leaks.push(`${m.toUpperCase()} ${url} → ${r.status}`);
    }
    expect(leaks).toEqual([]);
    // estado de A intacto
    const row = (await pool.query(`SELECT title, deleted_at FROM projects WHERE id=$1`, [P])).rows[0]; expect(row.title).toBe('Projeto secreto de A'); expect(row.deleted_at ?? null).toBeNull();
    expect((await pool.query(`SELECT revoked_at FROM api_keys WHERE id=$1`, [ids.apiKey])).rows[0].revoked_at).toBeNull();
    expect((await pool.query(`SELECT status FROM batch_jobs WHERE id=$1`, [ids.batch])).rows[0].status).toBe('running');
  });

  it('listagens de B não contêm itens de A', async () => {
    const lists = ['/api/v1/projects', '/api/v1/catalogs', '/api/v1/api-keys', '/api/v1/publications', '/api/v1/batch-jobs', '/api/v1/affiliates/links', '/api/v1/notifications', '/api/v1/templates/mine', '/api/v1/templates'];
    const leaks: string[] = [];
    for (const url of lists) { const r = await http.get(url).set(auth(b)); const text = JSON.stringify(r.body); for (const [k, v] of Object.entries(ids)) if (text.includes(v) && !(url === '/api/v1/templates' && k === 'template' && false)) leaks.push(`${url} contém ${k}`); }
    expect(leaks).toEqual([]);
  });

  it('nenhuma resposta do próprio usuário expõe segredos (hash de senha, TOTP, tokens cifrados, hash de API key)', async () => {
    const urls = ['/api/v1/users/me', '/api/v1/users/me/consents', '/api/v1/api-keys', '/api/v1/affiliates/accounts', '/api/v1/integrations', '/api/v1/projects', `/api/v1/projects/${ids.project}`, '/api/v1/referrals/me', '/api/v1/notifications', '/api/v1/affiliates/earnings'];
    const found: string[] = [];
    for (const url of urls) { const r = await http.get(url).set(auth(a)); const m = JSON.stringify(r.body).match(SENSITIVE); if (m) found.push(`${url}: ${m[0]}`); }
    expect(found).toEqual([]);
  });

  it('rotas públicas não expõem e-mail nem dados privados de criadores/usuários', async () => {
    await pool.query(`UPDATE templates SET moderation_status='approved' WHERE id=$1`, [ids.template]);
    const code = (await pool.query(`SELECT referral_code FROM users WHERE id=$1`, [a.id]).catch(() => ({ rows: [] as Array<{ referral_code?: string }> }))).rows[0]?.referral_code;
    const urls = [`/api/v1/templates/${ids.template}`, '/api/v1/templates', `/api/v1/public/templates/${ids.template}`, '/api/v1/public/sitemap.xml', '/api/v1/status', '/api/v1/status.rss', ...(code ? [`/api/v1/ref/${code}`] : [])];
    const found: string[] = [];
    for (const url of urls) { const r = await http.get(url); const text = (r.text ?? '') + JSON.stringify(r.body ?? ''); if (text.includes(a.email)) found.push(`${url}: e-mail`); const m = text.match(SENSITIVE); if (m) found.push(`${url}: ${m[0]}`); }
    expect(found).toEqual([]);
  });


  it('todas as rotas /admin/* recusam usuário comum e requisição anônima (403/401)', async () => {
    const spec = parseYaml(readFileSync('docs/openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, unknown>> };
    const bad: string[] = []; let n = 0;
    for (const [path, ops] of Object.entries(spec.paths)) {
      if (!path.includes('/admin/')) continue;
      const url = '/api/v1' + path.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000001');
      for (const m of Object.keys(ops).filter((k) => ['get', 'post', 'put', 'patch', 'delete'].includes(k))) {
        n++; const call = (http as unknown as Record<string, (u: string) => import('supertest').Test>)[m];
        const asUser = await call(url).set(auth(b)).send({}); if (asUser.status !== 403) bad.push(`${m.toUpperCase()} ${path} (usuário) → ${asUser.status}`);
        const anon = await call(url).send({}); if (anon.status !== 401) bad.push(`${m.toUpperCase()} ${path} (anônimo) → ${anon.status}`);
      }
    }
    expect(n).toBeGreaterThan(50); expect(bad).toEqual([]);
  });

  it('erros não vazam SQL, stack trace nem caminhos internos', async () => {
    const r = await http.get('/api/v1/projects/not-a-uuid').set(auth(a)); const text = JSON.stringify(r.body);
    expect(r.status).toBeGreaterThanOrEqual(400); expect(text).not.toMatch(/at \w+ \(|\/home\/|node_modules|SELECT |syntax error|pg_/i);
  });
});
