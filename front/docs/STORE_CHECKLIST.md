# NexusReel — Checklist de lançamento nas lojas

App: **NexusReel** · Bundle/Application ID: `com.nexusreel.app` · Versão: **1.0.0** (build 1) · Capacitor 6.
Legenda: ✅ pronto no repositório · 🔧 precisa de configuração/conta externa · 🍎 só em macOS.

## 1. Build
| Item | Status | Como |
|---|---|---|
| Web bundle (PWA) | ✅ | `node web/build.mjs` (minifica) → `web/` é o `webDir` |
| Projeto Android | ✅ gerado (`android/`) | `npx cap sync android` |
| APK debug / AAB release | 🔧 | Requer Android SDK + JDK 17: `cd android && ./gradlew assembleDebug` / `./gradlew bundleRelease` (`npm run build:android`). **Não foi possível compilar no ambiente de desenvolvimento desta fase (sem Android SDK).** |
| Projeto iOS | 🍎 | `npx cap add ios && npx cap sync ios`, abrir no Xcode. Acrescentar chaves de `ios-notes/Info.plist.additions.xml` |
| Assinatura Android | 🔧 | Criar keystore (`keytool -genkey -v -keystore nexusreel.jks -alias nexus -keyalg RSA -keysize 2048 -validity 10000`), guardar em segredo do CI; ativar Play App Signing |
| Assinatura iOS | 🔧🍎 | Apple Developer Program (US$ 99/ano), certificado de distribuição + provisioning profile (fastlane match) |

## 2. Ativos
- ✅ Ícones: `web/icons/` (48–1024 px, maskable 512) e mipmaps do Android atualizados.
- ✅ Splash: `web/splash/` (iPhone, iPhone Max, iPad, Android). Fundo `#0B0B12`.
- 🔧 Screenshots das lojas (6,7" e 5,5" iPhone; 12,9" iPad; telefone/tablet Android): capturar do app real.
- 🔧 Ícone 1024×1024 sem transparência (App Store) e *feature graphic* 1024×500 (Play).

## 3. Permissões (justificativa para revisão)
| Permissão | Para quê |
|---|---|
| Câmera | Tirar as fotos sugeridas pela PhotoCoach |
| Fotos / mídia (leitura) | Escolher fotos da galeria para o vídeo |
| Fotos (adicionar) – iOS | Salvar o vídeo final |
| Notificações | Avisar quando a geração terminar (opcional, pedida em contexto) |
| Internet / estado de rede | Geração, publicação, banner offline |
Não pedimos localização, contatos nem microfone.

## 4. Deep links
- Esquema: `nexusreel://create`, `nexusreel://project/<id>`.
- Links universais: `https://app.nexusreel.com/r/<id>` — 🔧 publicar `/.well-known/assetlinks.json` (Android) e `/.well-known/apple-app-site-association` (iOS) no domínio.

## 5. Safe areas / UI
✅ `viewport-fit=cover`, `env(safe-area-inset-*)` na barra de abas e topo; RTL pronto (`dir` automático); Dynamic Type/fontes escaláveis via `rem`.

## 6. Privacidade e conformidade (lojas)
- ✅ Política de Privacidade e Termos (PT/EN/ES) dentro do app (Perfil e Paywall) — **textos-modelo, exigem revisão jurídica**. Ver `PRIVACY.md`.
- 🔧 URL pública da política (campo obrigatório nas lojas).
- 🔧 **Apple Privacy Nutrition Label** e **Google Play Data Safety**: preencher conforme tabela em `PRIVACY.md`.
- ✅ Exclusão de conta dentro do app (exigência Apple 5.1.1(v) e Play): Perfil → Configurações → Dados e privacidade.
- ✅ Verificação de idade (stub): <13 bloqueado; 13–17 exige responsável. Classificação etária sugerida: 12+/Teen (conteúdo gerado por usuário).
- 🔧 Sign in with Apple obrigatório se houver login social de terceiros no iOS.
- 🔧 Termos de uso de cada plataforma de publicação (TikTok, YouTube, Instagram) e auditoria dos apps OAuth.
- 🔧 Compras: se vender créditos/planos no app, usar IAP (Apple/Google Billing) — o protótipo simula Stripe/gateway.

## 7. CI/CD, versionamento e rollout
- **Semver** `MAJOR.MINOR.PATCH`; `versionCode` Android = nº do build do CI (monotônico); `CFBundleVersion` idem. Tag git `v1.0.0`.
- **Pipeline sugerido (GitHub Actions)**: `typecheck` → `npm test` → `node web/build.mjs` → Lighthouse CI (falha se performance < 90) → `cap sync` → Android `bundleRelease` (runner Ubuntu) → upload para Play *internal track*; iOS via runner macOS + fastlane `pilot` (TestFlight).
- **Rollout gradual**: Play Console staged rollout 1% → 5% → 20% → 50% → 100%; iOS *phased release* (7 dias). Em paralelo, *feature flags* por região/plano/percentual (`rolloutPercent`) e **kill switches** (ver `OBSERVABILITY.md`). Critério de parada: taxa de falha de geração > 5% ou `publication_failure_total` ↑ 2×.
- **Rollback**: pausar rollout, desligar a flag, publicar hotfix `PATCH`.

## 8. Observabilidade móvel (stubs)
`@sentry/capacitor` (crashes) e `posthog-capacitor` (analytics, só com consentimento "analytics"). Ver `OBSERVABILITY.md`.

## 9. Teste antes de enviar
☐ Fluxo Criar→Gerar→Dublar→Publicar em pt-BR/en/es · ☐ Offline/online · ☐ Exclusão de conta · ☐ Modo escuro · ☐ Leitor de tela (TalkBack/VoiceOver) · ☐ iPhone SE e Android pequeno · ☐ Deep links · ☐ Crash-free > 99,5% no track interno.
