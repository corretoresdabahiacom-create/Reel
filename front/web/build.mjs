// Minifica o <script> inline do app (esbuild) -> web/dist-index.html. Uso: node web/build.mjs
import fs from "node:fs"; import { transformSync } from "esbuild";
const h = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const i = h.lastIndexOf("<script>", h.lastIndexOf("ReactDOM.createRoot")), j = h.indexOf("</script>", i);
const code = transformSync(h.slice(i + 8, j), { minify: true, target: "es2020" }).code;
fs.writeFileSync(new URL("./index.min.html", import.meta.url), h.slice(0, i + 8) + code + h.slice(j));
console.log("ok", h.length, "->", h.length - (j - i - 8) + code.length);
