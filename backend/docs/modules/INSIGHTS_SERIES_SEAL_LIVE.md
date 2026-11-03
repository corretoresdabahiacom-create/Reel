# Módulo 10 — Inteligência preditiva, seriado, selo de autenticidade e live commerce

**Flags:** `ff_insights`, `ff_series`, `ff_seal` e `ff_live`, todas desligadas por padrão.
- **Com a flag desligada:** as rotas do grupo respondem **404**, inclusive as públicas (`POST /seal/verify` e `GET /live/:id/watch`). A flag é conferida antes do limite, da idempotência e da leitura do corpo, e o app fica idêntico.
- **Independência:** o módulo não depende do Módulo 8.

**Migration:** `0019_insights_series_seal_live` · **Teste:** `tests/32-insights-series-seal-live.test.ts`.

**Biblioteca nova:** `@contentauth/c2pa-node@0.9.9` (oficial da Content Authenticity Initiative, binding do SDK Rust `c2pa-rs`). É o caminho oficial para assinar e **embutir** o manifest C2PA no MP4 (hash BMFF) e para lê-lo e validá-lo do próprio arquivo, como o spec pede.

## 1. Inteligência preditiva (`predictiveInsights.scoreEngagement`)
- **Saída:** retenção, CTR e conversão de 0 a 100, mais até 6 sugestões ordenadas pelo efeito estimado, com texto em pt-BR, en e es.
- **Sempre "estimativa" (AI Act):**
  - `predictions.label` só aceita `'estimativa'` (CHECK no banco);
  - a resposta traz `isEstimate: true` e um aviso ("não é garantia de resultado").
- **Sem PII:**
  - `features_json` guarda só números e booleanos: duração, número de cenas, ritmo, palavras da abertura, se há pergunta, número ou CTA, música, versões traduzidas, tamanho do título, e o histórico de publicações agregado e em faixa;
  - o texto é lido, contado e descartado. O teste confere que nenhum valor é texto.
- **Modelo `heuristic-v1`:** regras auditáveis e locais. Um modelo treinado pode entrar no lugar com a mesma saída.
- **Limite:** **60/h por usuário** (mais 180/h por IP).
- **`ai_usage`:** `insights_score`.

## 2. Seriado (`seriesService`)
- **`createSeries`:** templates `mininovela`, `tutorial`, `lancamento` ou `livre`.
- **`addEpisode`:** o episódio é um projeto do usuário. Até 50 por série, sem repetir projeto.
- **`linkEpisodes`:** nova ordem completa, trocada de forma atômica (UNIQUE adiável). Refaz a continuidade:
  - "Anteriormente em …" monta-se com o fim do episódio anterior, no idioma pedido;
  - cada episódio aponta para o anterior e o próximo.
- **CTA por capítulo:**
  - link **https** sem credenciais, para fora da plataforma;
  - sem link próprio, o CTA aponta para o próximo capítulo ("Assista ao capítulo N");
  - `http:` e `javascript:` são recusados (422).
- **Isolamento:** RLS só do dono. Projeto de outra pessoa resulta em 404.

## 3. Selo de autenticidade (`authenticityService`)
- **`applyC2PA`:** só quando o usuário ativa (fila `seal-apply`, idempotente).
  - Assina o MP4 com C2PA (ES256) e **embute o manifest no arquivo** (caixa JUMBF + `c2pa.hash.bmff.v3`).
  - Grava um arquivo novo `projects/<id>/sealed/<selo>.mp4`. O original não muda (R1).
  - O registro fica com `c2pa_manifest_embedded = true` e `verify_url = NULL` (não há manifest remoto).
  - O mesmo vídeo pedido de novo devolve o mesmo selo.
- **Manifest:**
  - `c2pa.actions` com `c2pa.created` e `digitalSourceType = compositeWithTrainedAlgorithmicMedia`, mais `c2pa.edited` quando houve edição humana;
  - a asserção `com.nexusreel.seal`, que é o selo visível **"IA com direção humana"** (pt, en, es).
  - **Sem dado pessoal:** só "NexusReel" e uma referência opaca (hash) do projeto.
- **`generateSeal`:** o selo para a interface (texto, quem assinou, quando, rótulo do manifest).
- **`verifySeal(videoUrl)`:** **lê o manifest embutido nos bytes do arquivo** e valida assinatura, cadeia e hash do conteúdo.
  - `videoUrl` é uma referência **interna** do storage. Qualquer esquema (`https:`, `http:`, `file:`…) dá 422 `external_url_not_allowed`. Não há download nem SSRF.
  - O teste espiona `fetch` e confirma zero chamadas.
  - **Resultados possíveis:** `Trusted`/`Valid`, `Invalid` (arquivo adulterado: `assertion.bmffHash.mismatch`) ou `none` (sem selo).
- **`POST /seal/verify`:** verificação **pública** por upload de MP4 (até 100 MB). Nada é guardado; limite de 30/h por IP, conferido antes de ler o corpo.
- **Assinatura:**
  - **Produção:** `C2PA_SIGNER=kms`. A chave fica no AWS KMS (`ECDSA_SHA_256` sobre o digest; a assinatura DER vira r‖s), com a cadeia em `C2PA_CERT_CHAIN_PEM_B64` emitida por uma CA confiável.
  - **Fora de produção:** `C2PA_SIGNER=local`. O boot de produção recusa `local` (`env.productionProblems`).
  - **Testes:** usam uma PKI **efêmera** gerada na hora (`scripts/c2pa-dev-pki.ts`). Nenhuma chave é versionada.
  - **Sem configuração:** 503 `seal_not_configured`.
- **`ai_usage`:** `c2pa_sign` e `c2pa_verify`.

## 4. Live commerce com avatar de IA (`liveCommerceService`) — B2B (plano Business)
- **`createLiveSession`:**
  - catálogo do lojista com ao menos 1 produto;
  - avatar `preset` (apresentadores sintéticos `ana`, `leo`, `bia`) ou `custom` (imagem/voz do lojista);
  - **opt-in do lojista** (`merchantOptIn: true`, gravado em `merchant_opt_in_at`);
  - **rótulo "IA" obrigatório:** `aiLabelEnabled: false` dá 422, e `ai_label_enabled` tem CHECK `= true` no banco;
  - limite de **5/h por usuário** (mais 15/h por IP).
- **Consentimento `avatar_live`:** obrigatório para o avatar `custom` (`POST /live/consent`). Os pré-prontos não usam dado de ninguém. Revogar encerra as lives com avatar próprio. Nenhum dado do usuário treina avatar sem esse consentimento.
- **`startLive`:**
  - grava o evento **`ai_disclosure_shown`** com o texto do aviso **antes** de `started`;
  - gera as falas do avatar (provedor `mock`; `ai_usage avatar_live_script`);
  - permite até 3 lives no ar ao mesmo tempo.
- **Feed público `GET /live/:id/watch`:** só para lives no ar.
  - Sempre traz `aiLabel.visible = true` ("IA"/"AI"), o aviso, `avatar.synthetic = true`, o produto da vez (rotação a cada 30 s) e o catálogo.
  - **Cada exibição soma em `label_impressions`**, que é o registro de que o rótulo foi mostrado.
- **`stopLive`:** encerra a live e o feed público passa a responder 404.

## Rate limits (429)
| Rota | Por usuário | Por IP |
|---|---|---|
| `POST /projects/:id/insights` (scoreEngagement) | **60/h** | 180/h |
| `POST /live/sessions` (createLiveSession) | **5/h** | 15/h |
| `POST /projects/:id/seal` | 30/h | 30/h |
| `POST /seal/verify` (público) | — | 30/h |
| `GET /live/:id/watch` (público) | — | 600/min |

## LGPD
- **Exportação:** traz estimativas, séries e episódios, selos e lives.
- **Exclusão da conta:** apaga tudo isso.
- **Exclusão do projeto:** remove estimativas, selos e episódios (FK em cascata ao apagar de fato).
- **Auditoria** (sem texto de usuário): `series.*`, `seal.request`, `live.create/start/stop` e `consent.avatar_live.*`.

## Variáveis de ambiente
| Variável | Padrão | Uso |
|---|---|---|
| `C2PA_SIGNER` | `none` | `none` (selo indisponível), `local` (fora de produção) ou `kms` |
| `C2PA_CERT_CHAIN_PEM_B64` | — | Cadeia (folha + intermediárias) em PEM, base64 |
| `C2PA_PRIVATE_KEY_PEM_B64` | — | Só para `local` (PKCS#8) |
| `C2PA_KMS_KEY_ID` | — | Chave ECC_NIST_P256 no KMS (`kms`) |
| `C2PA_TRUST_ANCHORS_PEM_B64` | — | Âncoras extras de confiança para o verificador |
| `C2PA_TSA_URL` | — | Carimbo de tempo (opcional) |
| `LIVE_AVATAR_PROVIDER` | `mock` | Provedor do avatar |
| `INSIGHTS_MODEL` | `heuristic-v1` | Modelo das estimativas |

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Score com sugestões | 201 com 3 notas, sugestões com texto, `label = estimativa`, CHECK recusa outro rótulo, features só numéricas/booleanas |
| Série com 3 episódios | Ordem 1–3, "Anteriormente…", anterior/próximo, CTA próprio e "próximo capítulo", reordenar, isolamento |
| Selo C2PA verificável lendo o manifest embutido | `verifySeal` → `Trusted`, `embedded`, `verifyUrl null`; adulterado → `Invalid`; sem selo → `none`; URL externa → 422 e `fetch` nunca chamado; upload público → válido |
| Live com avatar (mock) e catálogo, `ai_label_enabled = true` | 201 com rótulo; UPDATE para false barrado pelo CHECK; eventos `created → ai_disclosure_shown → started`; feed com "IA" e 3 exibições registradas |
| Rate limits | 61ª estimativa e 6ª live = 429 |
| Flags desligadas = app idêntico | Todas as rotas, inclusive as públicas, dão 404 |

## Riscos e limites
- **Não verificável aqui:**
  - assinatura via AWS KMS (o caminho existe e a conversão DER→r‖s é testada, mas sem conta AWS);
  - certificado emitido por CA da lista de confiança C2PA (os testes usam CA efêmera como âncora);
  - TSA;
  - provedor real de avatar e streaming de vídeo da live (o mock entrega roteiro e rotação de produtos, não vídeo).
- **Binário nativo:** `c2pa-node` baixa o binário pré-compilado (Linux x64/arm64, glibc) no `npm ci`. A imagem `node:22-bookworm-slim` é compatível; Alpine (musl) não é.
- **Predição heurística:** sem dados reais de desempenho a confiança é baixa, e por isso o rótulo "estimativa" é fixo.
- **Manifest em plataformas:** redes que recodificam o vídeo removem o manifest. O selo vale para o arquivo baixado da NexusReel.
