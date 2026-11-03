# Matriz de provedores de IA (custo × qualidade × latência)

Fonte: `src/modules/cost-optimization/matrix.ts` (`PROVIDER_MATRIX`). **Valores são estimativas iniciais**; recalibrar mensalmente com `ai_usage` real. Só provedores com **Integrado = sim** participam do roteamento; os demais são candidatos (exigem contrato, DPIA e integração).

| Provedor | Tipo | Integrado | ¢/s (est.) | p95 (ms) | Qualidade (1–5) | Cenas | Região | Nota |
|---|---|---|---|---|---|---|---|---|
| kling | vídeo | sim | 2,8 | 80.000 | 4 | simples/padrão/complexa | global | primário atual |
| mock | vídeo | sim | 0 | 300 | 1 | simples | local | só dev/teste; nunca em produção |
| kling-lite | vídeo | **não** | 1,4 | 45.000 | 3 | simples | global | candidato (cenas simples) |
| runway | vídeo | **não** | 5,0 | 70.000 | 5 | padrão/complexa | global | candidato premium |
| luma | vídeo | **não** | 3,2 | 75.000 | 4 | padrão/complexa | global | candidato de **2º provedor** (requisito de BCP) |
| elevenlabs | TTS | sim | 0,9 | 8.000 | 5 | padrão | global | primário |
| azure-tts | TTS | **não** | 0,3 | 4.000 | 4 | padrão | multi (UE disponível) | candidato de 2º TTS e de região UE |

**Lacuna crítica de continuidade:** com apenas um provedor real de vídeo integrado, o *failover* de IA cai no mock. Ver `docs/BCP/PLAN.md` e o drill `npm run bcp -- run ai_provider_failure` (reporta a lacuna explicitamente).
