// Mostra a API dos Spaces candidatos de imagem→vídeo: node probe.mjs [space1 space2 ...]
import { Client } from '@gradio/client';
const spaces = process.argv.slice(2).length ? process.argv.slice(2) : ['zerogpu-aoti/wan2-2-fp8da-aoti-faster', 'Gojoosama/wan22-i2v', 'multimodalart/wan2-1-fast'];
for (const sp of spaces) {
  try {
    const c = await Client.connect(sp, process.env.HF_TOKEN ? { token: process.env.HF_TOKEN } : {});
    const a = await c.view_api();
    console.log('== OK', sp);
    for (const [k, v] of Object.entries(a.named_endpoints ?? {})) console.log(' ', k, JSON.stringify((v.parameters ?? []).map((p) => [p.parameter_name, p.component, p.parameter_default])));
  } catch (e) { console.log('== ERRO', sp, String(e).slice(0, 200)); }
}
