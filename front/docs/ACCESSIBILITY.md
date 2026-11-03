# Acessibilidade — WCAG 2.2 AA (Módulo 11)

## Automático (roda no CI: `.github/workflows/frontend-ci.yml` → job `accessibility`)
- **Comando:** `npm run a11y`. Usa axe-core 4.13.0 em **Chromium real**, porque contraste e foco precisam de layout e o jsdom não mede. Gera `a11y-report.json`.
- **Regras:** tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` e `wcag22aa`.
- **O CI falha com:**
  - qualquer violação **critical** ou **serious**;
  - erro de página;
  - foco invisível.
- **Telas cobertas:** 44 telas e estados, em 390 px (celular) e 1280 px (desktop):
  - apresentação, login e consentimento;
  - as 5 abas;
  - player com as flags desligadas e ligadas;
  - os painéis dos Módulos 6 a 11;
  - Modo Business e live.
- **Teclado:** 22 checagens.
  - Tab percorre cada tela e cada foco tem contorno visível (WCAG 2.4.7/2.4.11) e não fica escondido.
  - As abas trocam com as setas (padrão WAI-ARIA).
  - O teleprompter responde a Espaço (pausa), ↑/↓ (velocidade) e Esc (sair).
- **Resultado desta entrega:** **0 critical, 0 serious, 0 moderate, 0 minor; 0 problemas de teclado** (`evidence/axe-report.json`).

### Correções feitas
| Problema (axe) | Onde | Correção |
|---|---|---|
| `color-contrast` 4,23:1 | "Continuar com Meta" | `#1877F2` → `#166FE5` (4,73:1) |
| `color-contrast` 3,65:1 | Selo "Tk" do TikTok | `#FF2D55` → `#E11D48` (4,70:1) |
| `color-contrast` 4,23:1 | Aba selecionada (texto branco em `#8B5CF6`) | `#6D28D9` (7,1:1); idem em palavra selecionada (M9), número do capítulo (M10) e botões de trilha (M8) |
| `target-size` 18 px | Segmentos de cena do player | 24 px (WCAG 2.5.8) |
| `scrollable-region-focusable` | Carrossel da apresentação | `tabindex=0`, `role=region`, rótulo |
| Foco só pela cor da borda | Todos os campos `.input` | Contorno de 2 px no `:focus-visible` |

## Manual com leitor de tela — roteiro (NÃO executado nesta sessão: não há leitor de tela no ambiente → **não verificável aqui**)
Para cada combinação (VoiceOver no iOS 17+/Safari, TalkBack no Android 14/Chrome, NVDA 2024 no Windows/Firefox), anotar *passou / falhou / observação*:
1. **Apresentação:** o carrossel é anunciado como "carrossel" com rótulo. As setas mudam de slide. "Pular" é alcançável.
2. **Login e consentimento:**
   - cada caixa é anunciada como "caixa de seleção, marcada/desmarcada";
   - a data de nascimento tem rótulo;
   - erros são anunciados.
3. **Player:**
   - os segmentos anunciam "Ir para a cena N";
   - play e pausa têm nome;
   - os botões dos módulos têm texto.
4. **Acessibilidade (M11):**
   - as abas são anunciadas como "aba, 1 de 3, selecionada";
   - a prévia de legenda tem descrição;
   - o status "Legendas prontas" é anunciado (`role=status`);
   - na audiodescrição, cada campo "Cena N" tem rótulo e o bloqueio da exportação é lido (`aria-describedby`).
5. **Teleprompter (M11):**
   - o pedido de câmera é lido como alerta antes do pedido do sistema;
   - o palco é anunciado como diálogo;
   - "● Gravando" é anunciado;
   - a contagem regressiva é anunciada (`aria-live=assertive`);
   - "Gravação salva neste aparelho" é lida;
   - a caixa de opt-in é anunciada.
6. **Live (M10):** o rótulo "IA" tem nome acessível e a caixa de opt-in do lojista é anunciada.
7. **Previsão (M10):** as notas são lidas como "medidor" com o valor e o rótulo "ESTIMATIVA".

Registrar o resultado em `docs/ACCESSIBILITY_RESULTS.md` (versão do app, aparelho, leitor, data, quem testou).
