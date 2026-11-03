/** Catálogos de regras (cold-start) para prompts, ideias de foto e horários/plataformas. Heurísticas de mercado — substituídas gradualmente por dados próprios (ver docs/RECOMMENDATIONS.md). */
export type L3 = { 'pt-BR': string; en: string; es: string };
export interface PromptDef { id: string; category: string; objective: 'sell' | 'audience' | 'test_ai' | 'any'; text: L3 }
export const PROMPTS: PromptDef[] = [
  { id: 'p_moda_look', category: 'moda', objective: 'sell', text: { 'pt-BR': 'Mostre a peça em 3 looks diferentes, com close no tecido e na etiqueta, e termine com o preço e o frete grátis.', en: 'Show the item in 3 different outfits, close-up on fabric and label, and end with price and free shipping.', es: 'Muestra la prenda en 3 looks distintos, close-up de la tela y la etiqueta, y termina con el precio y envío gratis.' } },
  { id: 'p_moda_trend', category: 'moda', objective: 'audience', text: { 'pt-BR': 'Transição rápida entre 4 estilos usando a mesma peça: "1 peça, 4 jeitos de usar".', en: 'Quick transitions between 4 styles using the same item: "1 piece, 4 ways to wear it".', es: 'Transición rápida entre 4 estilos con la misma prenda: "1 prenda, 4 formas de usarla".' } },
  { id: 'p_eletro_demo', category: 'eletronicos', objective: 'sell', text: { 'pt-BR': 'Demonstre o produto em uso em 15 segundos: problema, solução, 3 benefícios e garantia.', en: 'Demo the product in use in 15 seconds: problem, solution, 3 benefits and warranty.', es: 'Demuestra el producto en uso en 15 segundos: problema, solución, 3 beneficios y garantía.' } },
  { id: 'p_eletro_unbox', category: 'eletronicos', objective: 'audience', text: { 'pt-BR': 'Unboxing em primeira pessoa com reação e um teste prático no final.', en: 'First-person unboxing with a reaction and a hands-on test at the end.', es: 'Unboxing en primera persona con reacción y una prueba práctica al final.' } },
  { id: 'p_beleza_antes', category: 'beleza', objective: 'sell', text: { 'pt-BR': 'Antes e depois em 3 cenas, modo de uso em 1 frase e chamada para compra.', en: 'Before and after in 3 scenes, how to use in one sentence and a call to buy.', es: 'Antes y después en 3 escenas, modo de uso en una frase y llamada a la compra.' } },
  { id: 'p_casa_ambiente', category: 'casa', objective: 'sell', text: { 'pt-BR': 'Mostre o produto no ambiente: antes bagunçado, depois organizado, com medidas na tela.', en: 'Show the product in the room: messy before, organized after, with measurements on screen.', es: 'Muestra el producto en el ambiente: antes desordenado, después organizado, con medidas en pantalla.' } },
  { id: 'p_alim_receita', category: 'alimentos', objective: 'audience', text: { 'pt-BR': 'Receita em 4 passos com o produto, close no resultado final e degustação.', en: 'A 4-step recipe using the product, close-up on the result and a tasting.', es: 'Receta en 4 pasos con el producto, close-up del resultado y degustación.' } },
  { id: 'p_geral_hook', category: 'geral', objective: 'any', text: { 'pt-BR': 'Abra com uma pergunta que gere curiosidade, mostre o produto em 3 ângulos e feche com uma oferta clara.', en: 'Open with a curiosity-driven question, show the product from 3 angles and close with a clear offer.', es: 'Abre con una pregunta que genere curiosidad, muestra el producto desde 3 ángulos y cierra con una oferta clara.' } },
  { id: 'p_geral_test', category: 'geral', objective: 'test_ai', text: { 'pt-BR': 'Vídeo de 20 segundos apresentando seu produto favorito em 3 cenas: o que é, para quem é e por que vale a pena.', en: 'A 20-second video presenting your favorite product in 3 scenes: what it is, who it is for and why it is worth it.', es: 'Video de 20 segundos presentando tu producto favorito en 3 escenas: qué es, para quién es y por qué vale la pena.' } },
];
export interface PhotoIdea { id: string; category: string; tag: 'angle' | 'light' | 'background' | 'detail' | 'context'; text: L3 }
export const PHOTO_IDEAS: PhotoIdea[] = [
  { id: 'ph_geral_front', category: 'geral', tag: 'angle', text: { 'pt-BR': 'Foto frontal centralizada, produto ocupando 70% do quadro.', en: 'Centered front shot, product filling 70% of the frame.', es: 'Foto frontal centrada, producto ocupando el 70% del encuadre.' } },
  { id: 'ph_geral_45', category: 'geral', tag: 'angle', text: { 'pt-BR': 'Ângulo de 45° mostrando volume e laterais.', en: '45° angle showing depth and sides.', es: 'Ángulo de 45° mostrando volumen y laterales.' } },
  { id: 'ph_geral_window', category: 'geral', tag: 'light', text: { 'pt-BR': 'Luz natural de janela, sem flash, fundo liso claro.', en: 'Natural window light, no flash, plain light background.', es: 'Luz natural de ventana, sin flash, fondo liso claro.' } },
  { id: 'ph_geral_detail', category: 'geral', tag: 'detail', text: { 'pt-BR': 'Close no detalhe que diferencia o produto (textura, costura, botão).', en: 'Close-up of the detail that sets the product apart (texture, stitching, button).', es: 'Close-up del detalle que distingue al producto (textura, costura, botón).' } },
  { id: 'ph_geral_scale', category: 'context', tag: 'context', text: { 'pt-BR': 'Produto na mão ou ao lado de um objeto conhecido para dar noção de tamanho.', en: 'Product in hand or next to a familiar object for scale.', es: 'Producto en la mano o junto a un objeto conocido para dar idea de tamaño.' } },
  { id: 'ph_moda_flat', category: 'moda', tag: 'angle', text: { 'pt-BR': 'Peça esticada em superfície plana, vista de cima, sem dobras.', en: 'Garment laid flat, top view, no wrinkles.', es: 'Prenda estirada en superficie plana, vista superior, sin arrugas.' } },
  { id: 'ph_moda_label', category: 'moda', tag: 'detail', text: { 'pt-BR': 'Close na etiqueta e no tecido para transmitir qualidade.', en: 'Close-up of the label and fabric to convey quality.', es: 'Close-up de la etiqueta y la tela para transmitir calidad.' } },
  { id: 'ph_eletro_ports', category: 'eletronicos', tag: 'detail', text: { 'pt-BR': 'Mostre portas, botões e a tela ligada em um único quadro.', en: 'Show ports, buttons and the screen on in a single frame.', es: 'Muestra puertos, botones y la pantalla encendida en un solo encuadre.' } },
  { id: 'ph_beleza_swatch', category: 'beleza', tag: 'detail', text: { 'pt-BR': 'Textura/cor aplicada na pele (swatch) ao lado da embalagem.', en: 'Texture/color swatch on skin next to the packaging.', es: 'Textura/color aplicado en la piel (swatch) junto al empaque.' } },
  { id: 'ph_casa_room', category: 'casa', tag: 'context', text: { 'pt-BR': 'Produto no ambiente real, com boa luz e sem bagunça ao fundo.', en: 'Product in a real room, good light, no clutter in the background.', es: 'Producto en el ambiente real, con buena luz y sin desorden al fondo.' } },
];
export type Platform = 'tiktok' | 'youtube' | 'instagram' | 'shopee' | 'temu' | 'olx' | 'mercadolivre';
/** Peso a priori de cada plataforma por objetivo (0..1). */
export const PLATFORM_PRIOR: Record<'sell' | 'audience' | 'test_ai', Record<Platform, number>> = {
  sell: { mercadolivre: 0.95, shopee: 0.9, olx: 0.6, temu: 0.5, tiktok: 0.55, instagram: 0.5, youtube: 0.4 },
  audience: { tiktok: 0.95, instagram: 0.9, youtube: 0.85, mercadolivre: 0.2, shopee: 0.2, olx: 0.1, temu: 0.1 },
  test_ai: { youtube: 0.7, tiktok: 0.7, instagram: 0.6, mercadolivre: 0.3, shopee: 0.3, olx: 0.2, temu: 0.2 },
};
/** Horários (hora local) historicamente fortes por plataforma — prior de cold-start. dow: 0=dom. */
export const PUBLISH_PRIOR: Record<Platform, Array<{ dow: number[]; hours: number[]; w: number }>> = {
  tiktok: [{ dow: [2, 3, 4], hours: [19, 20, 21], w: 1 }, { dow: [0, 6], hours: [11, 12, 20], w: 0.8 }],
  instagram: [{ dow: [1, 2, 3, 4, 5], hours: [11, 12, 18, 19], w: 1 }, { dow: [0], hours: [10, 11], w: 0.7 }],
  youtube: [{ dow: [4, 5, 6], hours: [14, 15, 16], w: 1 }, { dow: [0], hours: [10, 11], w: 0.8 }],
  mercadolivre: [{ dow: [1, 2, 3, 4], hours: [10, 11, 20, 21], w: 1 }, { dow: [0], hours: [19, 20], w: 0.8 }],
  shopee: [{ dow: [1, 2, 3, 4, 5], hours: [12, 13, 20, 21], w: 1 }, { dow: [6, 0], hours: [20, 21], w: 0.8 }],
  olx: [{ dow: [6, 0], hours: [9, 10, 11], w: 1 }, { dow: [1, 2, 3, 4, 5], hours: [19, 20], w: 0.7 }],
  temu: [{ dow: [1, 2, 3, 4, 5, 6, 0], hours: [20, 21, 22], w: 0.8 }],
};
export const DEFAULT_TZ: Record<string, string> = { LATAM: 'America/Sao_Paulo', EU: 'Europe/Berlin', US: 'America/New_York' };
