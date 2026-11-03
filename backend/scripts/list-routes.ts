import { buildApp } from '../src/app.js';
const routes: { method: string; url: string }[] = [];
const app = await buildApp({ bullBoard: false }); // onRoute precisa ser registrado antes; usamos printRoutes alternativo
await app.ready();
const txt = app.printRoutes({ commonPrefix: false, includeMeta: false });
console.log(txt); void routes; process.exit(0);
