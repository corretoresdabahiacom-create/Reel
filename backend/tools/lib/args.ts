export const arg = (a: string[], k: string, d?: string): string | undefined => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] && !a[i + 1]!.startsWith('--') ? a[i + 1] : d; };
export const flag = (a: string[], k: string): boolean => a.includes(`--${k}`);
export const isMain = (url: string): boolean => url === `file://${process.argv[1]}`;
