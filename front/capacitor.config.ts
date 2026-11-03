import type { CapacitorConfig } from "@capacitor/cli";

/** NexusReel — app nativo via Capacitor (iOS + Android). Bundle: com.nexusreel.app · v1.0.0 */
const config: CapacitorConfig = {
  appId: "com.nexusreel.app",
  appName: "NexusReel",
  webDir: "web",
  backgroundColor: "#0B0B12",
  server: { androidScheme: "https", iosScheme: "capacitor" /* produção: sem `url` (carrega o bundle local) */ },
  ios: { contentInset: "always", scrollEnabled: false, limitsNavigationsToAppBoundDomains: true },
  android: { allowMixedContent: false, captureInput: true },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: "#0B0B12", androidScaleType: "CENTER_CROP", showSpinner: false },
    StatusBar: { style: "DARK", backgroundColor: "#0B0B12", overlaysWebView: true },
    Keyboard: { resize: "body", resizeOnFullScreen: true },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;

/**
 * Permissões (declarar nos manifestos nativos):
 *  - Câmera (NSCameraUsageDescription / android.permission.CAMERA): tirar fotos sugeridas pela PhotoCoach.
 *  - Fotos (NSPhotoLibraryUsageDescription / READ_MEDIA_IMAGES): escolher fotos da galeria.
 *  - Salvar vídeo (NSPhotoLibraryAddUsageDescription): baixar o vídeo final.
 *  - Notificações (opcional): avisar quando o vídeo terminar.
 * Deep links: nexusreel://create, nexusreel://project/<id>, https://app.nexusreel.com/r/<id> (Universal Links / App Links).
 * Safe areas: o CSS usa env(safe-area-inset-*) (viewport-fit=cover).
 * TODO (Fase 6): plugins de observabilidade móvel — @sentry/capacitor e posthog-capacitor — ver docs/OBSERVABILITY.md.
 */
