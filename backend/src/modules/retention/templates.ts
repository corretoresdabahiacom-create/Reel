/** Conteúdo localizado das campanhas de ciclo de vida. Fallback: es-MX → es → en → pt-BR. */
export interface Msg { title: string; body: string; subject?: string; deepLink?: string }
type Locale = 'pt-BR' | 'en' | 'es' | 'es-MX'; type V = Record<string, string>;
const T: Record<string, Partial<Record<Locale, (v: V) => Msg>>> = {
  lc_d1_onboarding: {
    'pt-BR': (v) => ({ title: 'Falta pouco para seu primeiro vídeo', body: `${v.name ? v.name + ', c' : 'C'}onclua o onboarding: em 3 minutos você gera o primeiro vídeo. Dica: comece pelas fotos do produto.`, deepLink: 'nexusreel://onboarding' }),
    en: (v) => ({ title: 'You are close to your first video', body: `${v.name ? v.name + ', f' : 'F'}inish onboarding: in 3 minutes you can generate your first video. Tip: start with product photos.`, deepLink: 'nexusreel://onboarding' }),
    es: (v) => ({ title: 'Estás cerca de tu primer video', body: `${v.name ? v.name + ', t' : 'T'}ermina el onboarding: en 3 minutos generas tu primer video. Consejo: empieza con las fotos del producto.`, deepLink: 'nexusreel://onboarding' }),
    'es-MX': (v) => ({ title: 'Ya casi tienes tu primer video', body: `${v.name ? v.name + ', t' : 'T'}ermina el onboarding: en 3 minutos creas tu primer video desde tu celular. Tip: empieza con las fotos de tu producto.`, deepLink: 'nexusreel://onboarding' }),
  },
  lc_d7_publish: {
    'pt-BR': (v) => ({ title: 'Publique seu primeiro vídeo', body: `Que tal o template “${v.template ?? 'mais popular'}”? Veja o tutorial de 1 minuto e publique hoje.`, deepLink: 'nexusreel://templates' }),
    en: (v) => ({ title: 'Publish your first video', body: `How about the “${v.template ?? 'most popular'}” template? Watch the 1-minute tutorial and publish today.`, deepLink: 'nexusreel://templates' }),
    es: (v) => ({ title: 'Publica tu primer video', body: `¿Qué tal la plantilla “${v.template ?? 'más popular'}”? Mira el tutorial de 1 minuto y publica hoy.`, deepLink: 'nexusreel://templates' }),
    'es-MX': (v) => ({ title: 'Publica tu primer video', body: `¿Qué tal la plantilla “${v.template ?? 'más popular'}”? Mira el tutorial de 1 minuto y publícalo hoy en Mercado Libre o TikTok.`, deepLink: 'nexusreel://templates' }),
  },
  lc_d21_offer: {
    'pt-BR': (v) => ({ title: 'Um bônus para você voltar a criar', subject: 'Um bônus para você voltar a criar', body: `Separamos ${v.credits ?? 10} créditos extras para você. É só abrir o app e criar. Para sair deste e-mail: ${v.unsubscribeUrl ?? ''}`, deepLink: 'nexusreel://billing' }),
    en: (v) => ({ title: 'A bonus to get you creating again', subject: 'A bonus to get you creating again', body: `We set aside ${v.credits ?? 10} extra credits for you. Open the app and create. Unsubscribe: ${v.unsubscribeUrl ?? ''}`, deepLink: 'nexusreel://billing' }),
    es: (v) => ({ title: 'Un bono para que vuelvas a crear', subject: 'Un bono para que vuelvas a crear', body: `Reservamos ${v.credits ?? 10} créditos extra para ti. Abre la app y crea. Para darte de baja: ${v.unsubscribeUrl ?? ''}`, deepLink: 'nexusreel://billing' }),
    'es-MX': (v) => ({ title: 'Un bono para que vuelvas a crear', subject: 'Un bono para que vuelvas a crear', body: `Apartamos ${v.credits ?? 10} créditos extra para ti. Abre la app y crea. Para cancelar la suscripción a estos correos: ${v.unsubscribeUrl ?? ''}`, deepLink: 'nexusreel://billing' }),
  },
  lc_d45_winback: {
    'pt-BR': (v) => ({ title: 'Veja o que criadores como você estão fazendo', subject: 'Veja o que criadores como você estão fazendo', body: `Uma loja como a sua triplicou as vendas com vídeos gerados por IA. Volte e crie o seu. Sair da lista: ${v.unsubscribeUrl ?? ''}`, deepLink: 'nexusreel://home' }),
    en: (v) => ({ title: 'See what creators like you are doing', subject: 'See what creators like you are doing', body: `A shop like yours tripled sales with AI-generated videos. Come back and create yours. Unsubscribe: ${v.unsubscribeUrl ?? ''}`, deepLink: 'nexusreel://home' }),
    es: (v) => ({ title: 'Mira lo que hacen creadores como tú', subject: 'Mira lo que hacen creadores como tú', body: `Una tienda como la tuya triplicó sus ventas con videos generados por IA. Vuelve y crea el tuyo. Darse de baja: ${v.unsubscribeUrl ?? ''}`, deepLink: 'nexusreel://home' }),
  },
  lc_post_publish: {
    'pt-BR': (v) => ({ title: 'Publicado! 🎉', body: `Seu vídeo está no ar${v.platform ? ' no ' + v.platform : ''}. Quer levar para mais uma plataforma${v.suggest ? ' — ' + v.suggest + ' costuma performar bem' : ''}?`, deepLink: 'nexusreel://publish' }),
    en: (v) => ({ title: 'Published! 🎉', body: `Your video is live${v.platform ? ' on ' + v.platform : ''}. Want to take it to another platform${v.suggest ? ' — ' + v.suggest + ' tends to perform well' : ''}?`, deepLink: 'nexusreel://publish' }),
    es: (v) => ({ title: '¡Publicado! 🎉', body: `Tu video ya está en línea${v.platform ? ' en ' + v.platform : ''}. ¿Lo llevamos a otra plataforma${v.suggest ? ' — ' + v.suggest + ' suele funcionar bien' : ''}?`, deepLink: 'nexusreel://publish' }),
  },
};
export function chain(locale: string, country?: string | null): Locale[] { const l = locale === 'en' ? 'en' : locale === 'es' ? 'es' : 'pt-BR'; return l === 'es' && country?.toUpperCase() === 'MX' ? ['es-MX', 'es', 'en', 'pt-BR'] : [l, 'en', 'pt-BR']; }
export function renderLifecycle(templateId: string, locale: string, country: string | null | undefined, vars: V = {}): Msg {
  const t = T[templateId]; if (!t) throw new Error(`template de ciclo de vida desconhecido: ${templateId}`); for (const l of chain(locale, country)) { const f = t[l]; if (f) return f(vars); } throw new Error('sem tradução');
}
export const TEMPLATE_IDS = Object.keys(T);
