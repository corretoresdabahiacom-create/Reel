/**
 * Login com Firebase Authentication (plano gratuito Spark) — pacote separado (web/nexus-firebase.js), carregado só quando
 * `window.NEXUS_FIREBASE` está configurado, para não pesar no app.
 *
 * Fluxo: o Firebase cuida de senha, Google, verificação de e-mail e "esqueci a senha" (e-mails enviados por ele, sem custo);
 * com o e-mail verificado, o ID token vai para `POST /auth/firebase` e o app segue com a sessão própria (cookie httpOnly).
 * Link mágico do Firebase: só 5 e-mails/dia no plano gratuito — desligado por padrão (`emailLink: true` para ligar).
 */
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, signInWithPopup, GoogleAuthProvider, signOut, isSignInWithEmailLink, sendSignInLinkToEmail,
  signInWithEmailLink, type Auth, type User,
} from 'firebase/auth';

export interface NexusFirebaseConfig { options: FirebaseOptions; emulatorUrl?: string; emailLink?: boolean; locale?: string }
export type FirebaseStep = { status: 'signed_in'; idToken: string; email: string } | { status: 'verify_email'; email: string };

/** Mensagens do Firebase em linguagem do usuário (pt-BR; o resto do app traduz pelo i18n). */
const MSG: Record<string, string> = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Entre ou use "Esqueci a senha".', 'auth/weak-password': 'Senha fraca: use pelo menos 8 caracteres.',
  'auth/invalid-email': 'E-mail inválido.', 'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/popup-closed-by-user': 'Login com Google cancelado.', 'auth/popup-blocked': 'O navegador bloqueou a janela do Google. Permita pop-ups e tente de novo.',
  'auth/network-request-failed': 'Sem conexão. Verifique a internet e tente de novo.', 'auth/quota-exceeded': 'Limite diário de e-mails do plano gratuito atingido. Tente amanhã.',
  'auth/operation-not-allowed': 'Este método de login não está ativo no projeto Firebase.',
  'auth/internal-error': 'Não foi possível abrir o login. Verifique a conexão e tente de novo.',
};
export const friendlyFirebaseError = (e: unknown): string => MSG[(e as { code?: string })?.code ?? ''] ?? 'Não foi possível concluir o login. Tente de novo.';

export function createFirebaseAuth(cfg: NexusFirebaseConfig) {
  const app = initializeApp(cfg.options, 'nexusreel');
  const auth: Auth = getAuth(app);
  if (cfg.emulatorUrl) connectAuthEmulator(auth, cfg.emulatorUrl, { disableWarnings: true });
  auth.languageCode = cfg.locale ?? 'pt-BR';
  const step = async (u: User): Promise<FirebaseStep> => {
    await u.reload();
    if (!u.emailVerified) return { status: 'verify_email', email: u.email ?? '' };
    return { status: 'signed_in', idToken: await u.getIdToken(true), email: u.email ?? '' };
  };
  return {
    /** Cria a conta e manda o e-mail de verificação (o login só vale depois de confirmar). */
    async signUp(email: string, password: string): Promise<FirebaseStep> {
      const c = await createUserWithEmailAndPassword(auth, email, password); await sendEmailVerification(c.user); return step(c.user);
    },
    async signIn(email: string, password: string): Promise<FirebaseStep> { return step((await signInWithEmailAndPassword(auth, email, password)).user); },
    async google(): Promise<FirebaseStep> { return step((await signInWithPopup(auth, new GoogleAuthProvider())).user); },
    /** "Já confirmei": relê o usuário; se o e-mail foi verificado, devolve o token. */
    async refresh(): Promise<FirebaseStep | null> { return auth.currentUser ? step(auth.currentUser) : null; },
    async resendVerification(): Promise<void> { if (auth.currentUser) await sendEmailVerification(auth.currentUser); },
    async resetPassword(email: string): Promise<void> { await sendPasswordResetEmail(auth, email); },
    emailLinkEnabled: !!cfg.emailLink,
    async sendLink(email: string, returnUrl: string): Promise<void> {
      if (!cfg.emailLink) throw Object.assign(new Error('link desligado'), { code: 'auth/operation-not-allowed' });
      await sendSignInLinkToEmail(auth, email, { url: returnUrl, handleCodeInApp: true });
    },
    isLink: (url: string) => isSignInWithEmailLink(auth, url),
    async completeLink(email: string, url: string): Promise<FirebaseStep> { return step((await signInWithEmailLink(auth, email, url)).user); },
    async signOut(): Promise<void> { await signOut(auth); },
  };
}
export type NexusFirebaseAuth = ReturnType<typeof createFirebaseAuth>;
