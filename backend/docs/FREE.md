# Instalação gratuita (sem AWS, sem nenhum serviço pago)

Perfil `APP_PROFILE=free`. Tudo roda num único servidor com Docker; nenhuma conta paga, nenhum cartão cobrado pelo app.
A versão completa (AWS: S3, CloudFront, KMS, ECR/ECS) continua no repositório (`infra/terraform`, jobs AWS do `cd.yml`)
para migrar no futuro — ver "Migrar depois" no fim.

## O que fica gratuito e como

| Parte | Na instalação gratuita | Custo |
|---|---|---|
| Servidor | Seu computador, ou uma VM gratuita (ver "Onde hospedar") | 0 |
| Banco e filas | Postgres 16 + Redis 7 em contêineres | 0 |
| Arquivos (fotos, vídeos) | Disco do servidor (`STORAGE_DRIVER=local`, volume `storage`), com links assinados e streaming com Range (iPhone/Safari) | 0 |
| HTTPS | Caddy + Let's Encrypt automático; front e API no mesmo domínio | 0 |
| Login | E-mail e senha do próprio app, ou Firebase Authentication (plano Spark): cadastro, verificação de e-mail, "esqueci a senha", Google | 0 |
| Vídeo | Montado com FFmpeg a partir das fotos (`AI_VIDEO_PROVIDER=mock`) — IA de vídeo real não existe grátis | 0 |
| Narração | Vozes abertas Piper e Kokoro (pt-BR, en, es; femininas e masculinas), escolhidas pelo usuário, ou a **voz do próprio usuário gravada no app**; reserva: espeak-ng. A cena dura o tempo da fala | 0 |
| Música | Composta pelo app e tocada com instrumentos reais (FluidSynth + soundfont FluidR3_GM, MIT); biblioteca CC0 (FreePD) importada com licença e origem; ou a música do próprio usuário (com declaração de direitos) | 0 |
| Legendas e transcrição | Cronometradas pela fala; transcrição local com faster-whisper | 0 |
| Pagamentos | Desligados (`PAYMENTS_MODE=off`): checkout, Pix, saques e webhooks respondem 503 `payments_disabled` com mensagem | 0 |
| Publicação nas redes | Simulada (`PLATFORM_MODE=mock`) até haver apps aprovados nas plataformas | 0 |
| E-mails do app (convites etc.) | Só no log (`EMAIL_PROVIDER=log`). Os e-mails de login saem pelo Firebase | 0 |

## Subir

```bash
cp infra/free/env.free.example .env.free          # preencha SITE_DOMAIN (e o Firebase, se usar)
bash infra/free/gen-secrets.sh >> .env.free       # segredos gerados na sua máquina; não versione .env.free
cp -r ../nexusreel-phase3/web ./front             # front estático (ou ajuste FRONT_DIR)
bash infra/free/gen-front-config.sh .env.free     # gera o nexus-config.js do front
docker compose -f docker-compose.free.yml --env-file .env.free build migrate && docker compose -f docker-compose.free.yml --env-file .env.free up -d
```

- A primeira construção baixa as vozes do Piper e o modelo `base` do Whisper (Hugging Face). Sem internet no build, a
  imagem sobe assim mesmo: a voz cai para o espeak-ng; a transcrição falha com aviso claro (nesse caso, `AI_STT_PROVIDER=mock`).
  `--build-arg OPEN_AI_MODELS=0` pula o download.
- `SITE_DOMAIN=localhost` serve para testar na própria máquina (o Caddy usa um certificado local).
- Domínio grátis: um subdomínio do DuckDNS (ou similar) apontando para o IP do servidor; portas 80 e 443 abertas.
- A API recusa subir com configuração insegura. Um teste (`tests/43`) confere que este compose, com os segredos gerados,
  passa em todas as regras de produção.

## Estúdio de voz e música

Ligado sozinho na instalação gratuita: o serviço `migrate` liga as flags `ff_voice_studio` e `ff_sections` (edição por seções de 15 s) e importa a biblioteca CC0.
Para desligar: `docker compose -f docker-compose.free.yml --env-file .env.free run --rm migrate node dist/cli/flags.js off ff_voice_studio`.

Na etapa 3 do "Criar", o usuário:
- escolhe a voz e toca "Ouvir" (texto → voz no servidor), ouve o roteiro inteiro e pode baixar o áudio;
- ou grava a própria voz pelo microfone (navegador do computador ou do celular), ou envia um arquivo de áudio. O
  servidor limpa a gravação (ruído e volume), e as legendas seguem as palavras ditas (transcrição local);
- escolhe a música (biblioteca, "Compor música nova" ou "Enviar minha música") e o volume dela por baixo da voz.

**Licenças das vozes** (conferidas no MODEL_CARD de cada uma):
- Kokoro (Dora, Alex, Heart, Michael…) e as vozes em inglês de domínio público (Linda, Kristin, Norman): uso comercial ok.
- Piper em pt-BR (Faber, Cadu, Jeff) e es (Davi, Aldo): dados livres (CC0), mas o modelo partiu de uma voz de pesquisa
  ("lessac"). O app mostra o aviso "revisar antes de uso comercial"; antes de cobrar, prefira as vozes Kokoro.
- Vozes com licença não comercial ficaram de fora.

**Música CC0**: `infra/free/music-cc0.json` lista 16 faixas do FreePD (CC0 1.0). O FAQ do FreePD autoriza o uso "num app que
gera vídeos para usuários". Para importar de novo ou incluir mais: edite o arquivo e rode o `migrate` (ele pula o que já existe).

**Modelos de voz**: o build copia da pasta `models/`, se existir (baixe uma vez com `python3 tools/models/baixar.py models`;
cerca de 800 MB). Sem ela, o build baixa da internet.

## Login com Firebase (opcional)

1. Em console.firebase.google.com, crie um projeto (plano Spark, gratuito; não ative o faturamento).
2. Em Authentication → Método de login, ative "E-mail/senha" e, se quiser, "Google".
3. Em Authentication → Configurações → Domínios autorizados, adicione o seu `SITE_DOMAIN`.
4. Em Configurações do projeto → Seus apps, registre um app Web. Copie `apiKey`, `authDomain`, `projectId` e `appId`
   para o `.env.free` (`FIREBASE_*`).
5. Rode `gen-front-config.sh` de novo e reinicie (`docker compose ... up -d`).

- A `apiKey` web do Firebase é pública por desenho: só identifica o projeto. A proteção está nos domínios autorizados e
  na conferência do token no backend.
- O backend confere o token sem SDK nem segredo: certificados públicos do Google, RS256, projeto, emissor, validade e
  e-mail verificado. Nenhuma credencial do Firebase fica no servidor.
- Sem `FIREBASE_PROJECT_ID`, a rota `/auth/firebase` fica desligada (404) e vale o login próprio do app.

**Limites do plano Spark** (conferir na página de preços do Firebase, que pode mudar):
- 3.000 usuários ativos por dia;
- e-mails de verificação: 1.000/dia;
- redefinição de senha: 150/dia;
- link mágico: 5/dia, por isso fica desligado (`emailLink: false`).

Passou do limite, o usuário vê "Limite diário de e-mails do plano gratuito atingido. Tente amanhã."

## Testar no celular (link temporário)

O celular precisa de um endereço HTTPS. O `docker-compose.tunnel.yml` abre um link público e temporário da Cloudflare
(Quick Tunnel: grátis, sem conta), apontando para o seu computador só enquanto o teste dura:

```bash
F="-f docker-compose.free.yml -f docker-compose.tunnel.yml --env-file .env.free"
docker compose $F up -d tunnel && docker compose $F logs tunnel | grep trycloudflare   # anote o https://….trycloudflare.com
# no .env.free: TUNNEL_URL=https://….trycloudflare.com   (links do vídeo e da API passam a usar esse endereço)
docker compose $F up -d api worker
# Firebase (se usar): Authentication → Configurações → Domínios autorizados → adicione o ….trycloudflare.com
docker compose $F stop tunnel   # fim do teste: o link deixa de existir; apague TUNNEL_URL e rode "up -d api worker" de novo
```

Qualquer pessoa com o link abre o app enquanto o túnel estiver ligado: não divulgue e desligue no fim.

## Onde hospedar sem custo

- **Sua máquina** (com o computador ligado): custo zero, sem cartão.
- **Oracle Cloud Always Free**: VM Ampere A1 (hoje 2 OCPU e 12 GB no Always Free), 200 GB de disco, 10 TB de saída por mês. Pede cartão para validar a conta,
  mas não cobra dentro do limite. A Oracle pode recolher VMs ociosas. Confira os limites atuais no site antes de criar.
- **Evite** serviços "free" que suspendem a aplicação ou apagam o banco depois de alguns dias: perde-se dados.

## Cópia de segurança

O que guardar: os volumes `pgdata` (banco) e `storage` (arquivos) e o arquivo `.env.free` (sem ele, os tokens
criptografados não abrem).

```bash
docker compose -f docker-compose.free.yml --env-file .env.free exec postgres pg_dump -U nexus nexusreel | gzip > backup-$(date +%F).sql.gz
docker run --rm -v nexusreel-backend_storage:/s -v "$PWD":/b alpine tar czf /b/storage-$(date +%F).tgz -C /s .
```

Guarde as cópias fora do servidor. O nome do volume segue o nome da pasta (confira com `docker volume ls`).

## Migrar depois (quando houver orçamento)

- **Arquivos → S3** (ou compatível): `STORAGE_DRIVER=s3` + `S3_*`. O código do driver S3 está pronto e testado (s3rver,
  moto e conferência de assinatura SigV4). Copie a pasta do volume `storage` para o bucket com a mesma estrutura.
- **AWS completa**: `infra/terraform/envs/{staging,production}` e a variável do repositório `AWS_ENABLED=true`, que liga os
  jobs de build → ECR, staging, smoke de storage e produção do `cd.yml`. Sem ela, o CD só compila a imagem gratuita.
- **Pagamentos**: `PAYMENTS_MODE=real` + chaves Stripe/Pix, e `APP_PROFILE=standard`.
- **IA paga**: `AI_VIDEO_PROVIDER`, `AI_TTS_PROVIDER=elevenlabs` etc.

O perfil `standard` volta a exigir storage em nuvem e provedores reais, porque as regras de produção dele não foram
afrouxadas.

## Não verificado neste ambiente de desenvolvimento

- Subir os contêineres de verdade (sem daemon Docker aqui); `docker compose config` dos dois arquivos passa.
- O download dos modelos do Piper e do Whisper (Hugging Face bloqueado aqui).
- A janela do Google no navegador.
- Safari/iPhone.

A API em produção com estas mesmas variáveis e as telas Criar, Biblioteca e Excluir foram testadas em HTTPS, na mesma
origem, num navegador real (Electron).
