// Shared by the browser tests: bundles the real app with esbuild, serves it on a
// random port, and launches headless Chromium.
//
//   startApp({ backend: "local" })   original browser-only behaviour
//   startApp({ backend: "memory" })  the Firebase code path, backed by an in-memory
//                                    Firebase stand-in (no network needed)
const path = require("node:path");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");

const ROOT = path.resolve(__dirname, "../..");
const GLOBAL = process.env.E2E_NODE_PATH || "/home/claude/.npm-global/lib/node_modules";

function load(name, extra = []) {
  for (const base of [null, GLOBAL, ...extra]) {
    try { return require(base ? path.join(base, name) : name); } catch { /* try next */ }
  }
  throw new Error(`Cannot find "${name}". Install it (npm i -D ${name}) or set E2E_NODE_PATH.`);
}

async function startApp({ backend = "local" } = {}) {
  const { chromium } = load("playwright");
  const esbuild = load("esbuild", [path.join(GLOBAL, "tsx/node_modules")]);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), `ujp-e2e-${backend}-`));
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src/main.jsx")],
    bundle: true, jsx: "automatic", outfile: path.join(out, "bundle.js"),
    loader: { ".jsx": "jsx", ".jpg": "dataurl", ".jpeg": "dataurl", ".png": "dataurl" },
    // Vite supplies import.meta.env in a real build; here it is set directly.
    define: {
      "process.env.NODE_ENV": '"development"',
      "import.meta.env": backend === "memory" ? '{"VITE_BACKEND":"memory"}' : "{}",
    },
    // the real Firebase SDK is never loaded in these tests
    external: ["firebase/app", "firebase/auth", "firebase/firestore"],
    logLevel: "error", nodePaths: [GLOBAL],
  });
  fs.writeFileSync(path.join(out, "index.html"),
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><link rel="stylesheet" href="bundle.css"></head><body><div id="root"></div><script src="bundle.js"></script></body></html>');
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    const file = url.startsWith("/assets/") ? path.join(ROOT, "public", url) : path.join(out, url === "/" ? "index.html" : url);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(file);
      res.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" }[ext] || "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, r));
  const BASE = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  return { ROOT, BASE, browser, bundleDir: out, close: async () => { await browser.close(); server.close(); } };
}

// Replaces window.open so tests can read the WhatsApp link. The app opens a blank tab
// first and points it at the message once the order is saved, so the stub returns a
// fake tab whose `location.href` is captured too.
const OPEN_STUB = () => {
  window.__opened = [];
  window.open = (u) => {
    window.__opened.push(u);
    return { opener: null, close() { window.__opened.push("closed"); }, location: { set href(v) { window.__opened.push(v); } } };
  };
};

module.exports = { ROOT, load, startApp, OPEN_STUB };
