// End-to-end browser test. Bundles the real app, serves it, and drives it in
// headless Chromium.
//
//   node tests/e2e/run.cjs
//
// Needs `playwright` (with a Chromium browser) and `esbuild` (Vite already
// installs it). When they aren't in node_modules it also looks in the global
// install folder; set E2E_NODE_PATH to point somewhere else.
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
const { chromium } = load("playwright");
const esbuild = load("esbuild", [path.join(GLOBAL, "tsx/node_modules")]);

let failures = 0;
let passes = 0;
const check = (name, ok, extra = "") => {
  if (ok) { passes++; console.log(`  ✓ ${name}`); }
  else { failures++; console.log(`  ✗ ${name} ${extra}`); }
};

(async () => {
  // ---- build + serve ----
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "ujp-e2e-"));
  await esbuild.build({
    entryPoints: [path.join(ROOT, "src/main.jsx")],
    bundle: true, jsx: "automatic", outfile: path.join(out, "bundle.js"),
    loader: { ".jsx": "jsx", ".jpg": "dataurl", ".jpeg": "dataurl", ".png": "dataurl" },
    define: { "process.env.NODE_ENV": '"development"' }, logLevel: "warning",
    nodePaths: [GLOBAL],
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
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  let dialogs = []; let dialogAnswer = true;
  page.on("dialog", (d) => { dialogs.push(d.message()); (dialogAnswer ? d.accept() : d.dismiss()).catch(() => {}); });
  await page.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });

  const ls = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), k);
  const patches = async () => (await ls("ujp_photo_patches")) || {};
  const physical = async (f, id) => (await patches())?.[f]?.stock?.[String(id)];
  const orders = async () => (await ls("ujp_orders")) || [];
  const lastMsg = async () => { const u = await page.evaluate(() => window.__opened.slice(-1)[0]); return u ? decodeURIComponent(new URL(u).searchParams.get("text") || "") : null; };
  const CUST = { shopName: "Test Gold House", location: "Tirunelveli", mobile: "9876543210" };

  async function reset(stock = { "1": 1000, "2": 400, "3": 200 }, extra = {}) {
    await page.goto(BASE);
    await page.evaluate(([stock, extra]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("ujp_photo_prices_reset_v1", "1");
      localStorage.setItem("ujp_photo_patches", JSON.stringify({ "ring-boxes": { deletedIds: [], edits: {}, prices: { "1": 8, "2": 8, "3": 8 }, added: [], stock } }));
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
    }, [stock, extra]);
  }
  async function role(r) {
    await page.evaluate(([r, c]) => {
      sessionStorage.clear(); localStorage.removeItem("ujp_customer");
      if (r === "rep") sessionStorage.setItem("ujp_salesrep_session", "Sales Rep 1");
      if (r === "admin") sessionStorage.setItem("ujp_admin_session", "true");
      if (r === "customer") localStorage.setItem("ujp_customer", JSON.stringify(c));
    }, [r, CUST]);
  }
  async function go(hash) { await page.goto(`${BASE}#/${hash}`); await page.reload(); await page.waitForTimeout(250); }
  async function addToCart(id, packs) {
    const c = page.locator(`#photo-${id}`);
    await c.locator(".qty-input").fill(String(packs)); await c.locator(".qty-input").blur();
    await c.locator(".add-to-cart-btn").click(); await page.waitForTimeout(100);
  }
  const adminTab = async (name) => { await role("admin"); await go("admin"); await page.locator(".admin-view-tab", { hasText: name }).click(); await page.waitForTimeout(200); };
  const seedApproved = (id, shop, lines) => ({ id, status: "approved", createdAt: new Date().toISOString(), shopName: shop, location: "Town", mobile: "9000011111", placedBy: "customer", salesRepName: "",
    lines: lines.map(([k, pieces, caption]) => ({ key: `ring-boxes:${k}`, folderId: "ring-boxes", photoId: k, caption, pieces })),
    reservedLines: lines.map(([k, pieces]) => ({ key: `ring-boxes:${k}`, pieces })) });

  // =====================================================================
  console.log("\n1. Cart: Total Qty shows pieces only");
  await reset(); await role("customer"); await go("ring-boxes"); await addToCart(1, 2);
  await page.locator(".cart-float").click();
  const summary = await page.locator(".cart-summary").innerText();
  check("summary reads 'Total qty: 300 pc' (no GR, no brackets)", /Total qty: 300 pc/.test(summary) && !/GR|\(/.test(summary), summary);

  console.log("\n2. Slogan lives in the footer — customers only, landing page only");
  await reset(); await go("");
  check("not signed in (landing): slogan in the footer", (await page.locator("footer .footer-slogan").count()) === 1);
  check("slogan is no longer under the header", (await page.locator(".slogan-section").count()) === 0);
  await role("customer"); await go("");
  check("customer on the home page: shown", (await page.locator("footer .footer-slogan").count()) === 1);
  await go("ring-boxes");
  check("customer on a folder page: hidden", (await page.locator(".footer-slogan").count()) === 0);
  await role("rep"); await go("");
  check("sales rep on the home page: hidden", (await page.locator(".footer-slogan").count()) === 0);
  await role("admin"); await go("");
  check("admin on the home page: hidden", (await page.locator(".footer-slogan").count()) === 0);

  console.log("\n3. Autofill — customer login");
  await reset(); await go("");
  check("first visit: form is empty, no autofill note", (await page.locator("#cust-shopName").inputValue()) === "" && (await page.locator(".customer-login-prefill").count()) === 0);
  check("fields carry browser-autofill hints", (await page.locator("#cust-shopName").getAttribute("autocomplete")) === "organization" && (await page.locator("#cust-mobile").getAttribute("autocomplete")) === "tel-national");
  await page.locator("#cust-shopName").fill(CUST.shopName); await page.locator("#cust-location").fill(CUST.location); await page.locator("#cust-mobile").fill(CUST.mobile);
  await page.locator(".customer-login-submit").click(); await page.waitForTimeout(250);
  await page.locator(".header-logout-btn").click(); await page.waitForTimeout(250);
  check("after logout the form is pre-filled with the last details", (await page.locator("#cust-shopName").inputValue()) === CUST.shopName && (await page.locator("#cust-location").inputValue()) === CUST.location && (await page.locator("#cust-mobile").inputValue()) === CUST.mobile);
  check("…with an explanatory note", (await page.locator(".customer-login-prefill").count()) === 1);
  check("the session itself is cleared (they are logged out)", (await ls("ujp_customer")) === null);
  await page.locator(".customer-login-prefill .link-btn").click();
  check("'Not you? Clear' empties the form and forgets the details", (await page.locator("#cust-shopName").inputValue()) === "" && (await ls("ujp_last_customer")) === null);
  await page.locator("#cust-shopName").fill(CUST.shopName); await page.locator("#cust-location").fill(CUST.location); await page.locator("#cust-mobile").fill(CUST.mobile);
  await page.locator(".customer-login-submit").click(); await page.waitForTimeout(250);
  await page.locator(".header-logout-btn").click(); await page.waitForTimeout(250);
  await page.reload(); await page.waitForTimeout(250);
  check("pre-fill survives a page reload", (await page.locator("#cust-mobile").inputValue()) === CUST.mobile);

  console.log("\n4. Autofill — staff cart form (known shops from past orders)");
  const past = (shop, loc, mob, id) => ({ id, status: "dispatched", createdAt: new Date().toISOString(), shopName: shop, location: loc, mobile: mob, lines: [], dispatchedLines: [] });
  await reset({ "1": 1000, "2": 400, "3": 200 }, { ujp_orders: [past("Sri Murugan Jewellers", "Tirunelveli", "9000010001", "p1"), past("Kaveri Gold Palace", "Madurai", "9000010002", "p2")] });
  await role("rep"); await go("ring-boxes"); await addToCart(1, 1);
  await page.locator(".cart-float").click();
  check("shop-name box offers the known shops", (await page.locator("#cart-known-shops option").count()) === 2 && (await page.locator("#cart-shopName").getAttribute("list")) === "cart-known-shops");
  await page.locator("#cart-shopName").fill("Sri Murugan Jewellers");
  check("typing a known shop fills its location and mobile", (await page.locator("#cart-location").inputValue()) === "Tirunelveli" && (await page.locator("#cart-mobile").inputValue()) === "9000010001");
  await page.locator("#cart-shopName").fill(""); await page.locator("#cart-location").fill("My own town"); await page.locator("#cart-mobile").fill("");
  await page.locator("#cart-shopName").fill("Kaveri Gold Palace");
  check("…but never overwrites something already typed", (await page.locator("#cart-location").inputValue()) === "My own town" && (await page.locator("#cart-mobile").inputValue()) === "9000010002");
  await page.locator("#cart-shopName").fill(""); await page.locator("#cart-location").fill(""); await page.locator("#cart-mobile").fill("");
  await page.locator("#cart-mobile").fill("90000 10001");
  check("typing a known mobile fills the shop name and location", (await page.locator("#cart-shopName").inputValue()) === "Sri Murugan Jewellers" && (await page.locator("#cart-location").inputValue()) === "Tirunelveli");
  await page.locator("#cart-shopName").fill("Brand New Shop");
  check("an unknown shop is left alone", (await page.locator("#cart-shopName").inputValue()) === "Brand New Shop");
  await role("customer"); await go("ring-boxes"); await addToCart(2, 1); await page.locator(".cart-float").click();
  check("customers never see the staff form or its suggestions", (await page.locator("#cart-known-shops").count()) === 0);

  console.log("\n5. WhatsApp messages follow the user's language");
  await reset(); await role("customer"); await go("ring-boxes"); await addToCart(1, 1);
  await page.locator(".cart-float").click(); await page.locator(".cart-order-btn").click(); await page.waitForTimeout(250);
  let msg = await lastMsg();
  check("English: order message is in English", /Shop Name: Test Gold House/.test(msg) && /Qty:/.test(msg) && /Please review and approve/.test(msg), msg);
  await go("ring-boxes"); await page.locator(".lang-btn", { hasText: "தமிழ்" }).click(); await page.waitForTimeout(200);
  await addToCart(2, 1);
  await page.locator(".cart-float").click(); await page.locator(".cart-order-btn").click(); await page.waitForTimeout(250);
  msg = await lastMsg();
  check("Tamil: labels are Tamil (shop, location, mobile, ref, qty, total, closing)", ["கடை பெயர்: Test Gold House", "இடம்: Tirunelveli", "மொபைல்: 9876543210", "ஆர்டர் எண்: #", "அளவு:", "மொத்தம்:", "நன்றி"].every((s) => msg.includes(s)), msg);
  check("Tamil: no English labels leaked in", !/Shop Name:|Location:|Qty:|Total:|Please review/.test(msg), msg);
  check("Tamil: amounts and the order ref are intact", /₹/.test(msg) && /#[A-Z0-9]{5}/.test(msg));
  const waHref = await page.locator(".banner-btn-whatsapp").getAttribute("href");
  check("'WhatsApp Us' opens with a Tamil greeting too", decodeURIComponent(waHref).includes("வணக்கம்"), waHref);
  await page.locator(".cart-close-btn").first().click(); await page.waitForTimeout(150);
  await page.locator(".lang-btn", { hasText: "EN" }).click(); await page.waitForTimeout(200);
  check("switching back gives the English greeting", decodeURIComponent(await page.locator(".banner-btn-whatsapp").getAttribute("href")).includes("Hi!"));

  console.log("\n6. Duplicate uploads are refused");
  const png = (seed) => Buffer.concat([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"), Buffer.from(seed)]);
  const realImg = fs.readFileSync(path.join(ROOT, "public/assets/folders/ring-boxes/crystal-round.jpg"));
  await reset(); await adminTab("Folders"); // ring-boxes is the first folder
  const upload = async (files) => { await page.locator('.admin-upload-btn input[type="file"]').setInputFiles(files); await page.waitForTimeout(500); };
  const addedCount = async () => ((await patches())["ring-boxes"]?.added || []).length;

  await upload([{ name: "IMG_2024_0001.jpg", mimeType: "image/jpeg", buffer: realImg }]);
  check("re-uploading an existing catalogue image (renamed) is blocked", (await addedCount()) === 0 && /already in the catalogue as/.test(await page.locator(".upload-notice").innerText()), await page.locator(".upload-notice").innerText().catch(() => ""));
  check("…and the message names the existing product", /Crystal Round Box/.test(await page.locator(".upload-notice").innerText()));
  await upload([{ name: "brand-new-box.png", mimeType: "image/png", buffer: png("one") }]);
  check("a genuinely new image uploads", (await addedCount()) === 1 && /1 photo\(s\) uploaded/.test(await page.locator(".upload-notice").innerText()));
  const saved = (await patches())["ring-boxes"].added[0];
  check("its content hash and file name are kept for next time", /^[0-9a-f]{64}$/.test(saved.hash) && saved.fileName === "brand-new-box.png");
  await upload([{ name: "same-picture-other-name.png", mimeType: "image/png", buffer: png("one") }]);
  check("the same picture under another name is blocked now", (await addedCount()) === 1 && /already in the catalogue/.test(await page.locator(".upload-notice").innerText()));
  await upload([{ name: "twin-a.png", mimeType: "image/png", buffer: png("two") }, { name: "twin-b.png", mimeType: "image/png", buffer: png("two") }]);
  check("two identical files in ONE selection → one added, one skipped", (await addedCount()) === 2 && /1 photo\(s\) uploaded/.test(await page.locator(".upload-notice").innerText()) && /1 duplicate\(s\) skipped/.test(await page.locator(".upload-notice").innerText()));
  await upload([{ name: "one-fresh.png", mimeType: "image/png", buffer: png("three") }, { name: "also-fresh.png", mimeType: "image/png", buffer: png("four") }]);
  check("a multi-file selection of new images uploads them all", (await addedCount()) === 4);

  dialogs = []; dialogAnswer = false;
  await upload([{ name: "crystal-round.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([realImg, Buffer.from("edited")]) }]);
  check("same file NAME but a different picture → asks first", dialogs.length === 1 && /same file name/.test(dialogs[0]) && /Crystal Round Box/.test(dialogs[0]), dialogs.join("|"));
  check("…and declining skips it", (await addedCount()) === 4);
  dialogs = []; dialogAnswer = true;
  await upload([{ name: "crystal-round.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([realImg, Buffer.from("edited2")]) }]);
  check("…accepting uploads it", (await addedCount()) === 5);
  dialogAnswer = true;

  console.log("\n7. Dispatch: remove and add products");
  const ordered = seedApproved("seed-1", "Dispatch Shop", [[1, 300, "Crystal Round Box"], [2, 150, "Magenta Diamond Box"]]);
  await reset({ "1": 1000, "2": 400, "3": 200 }, { ujp_orders: [ordered] });
  await adminTab("Dispatch");
  const card = page.locator(".order-card-approved");
  check("approved order is listed with both products", (await card.count()) === 1 && /Crystal Round Box/.test(await card.innerText()) && /Magenta Diamond Box/.test(await card.innerText()));
  await card.locator(".dispatch-add-input").fill("Crystal Round Box"); await page.waitForTimeout(150);
  const offered = await card.locator(".dispatch-add-name").allInnerTexts();
  check("search never offers a product that is already in the order", !offered.includes("Crystal Round Box"), offered.join("|"));
  await card.locator(".dispatch-add-input").fill("emerald"); await page.waitForTimeout(150);
  check("searching finds a product that wasn't ordered, with its free stock", (await card.locator(".dispatch-add-result").count()) === 1 && /200 PC\(s\) free/.test(await card.innerText()));
  await card.locator(".dispatch-add-result").click(); await page.waitForTimeout(150);
  check("it's added as a new row (badge, default min(150, free))", (await card.locator(".order-added-badge").count()) === 1 && (await card.locator(".order-line-added .qty-input").inputValue()) === "150");
  check("the picker no longer offers it", (await (async () => { await card.locator(".dispatch-add-input").fill("emerald"); await page.waitForTimeout(150); return (await card.locator(".dispatch-add-result").count()) === 0; })()));
  await card.locator(".dispatch-add-input").fill("");
  await card.locator(".order-line-added .qty-btn", { hasText: "+" }).click();
  check("added row steps up but stops at the free stock (150 + ½ GR → capped at 200)", (await card.locator(".order-line-added .qty-input").inputValue()) === "200");
  await card.locator(".order-line-added .qty-input").fill("201");
  check("cannot add more than the free stock (200) → error, confirm disabled", (await card.locator(".dispatch-line-error").count()) === 1 && (await card.locator("button", { hasText: "Confirm dispatch" }).isDisabled()));
  await card.locator(".order-line-added .qty-input").fill("60");
  const magentaLine = card.locator(".order-line", { hasText: "Magenta Diamond Box" }).first();
  await magentaLine.locator(".dispatch-remove", { hasText: "Remove" }).click(); await page.waitForTimeout(150);
  check("removing an ordered product marks it removed (struck through, with Undo)", /Removed from this dispatch/.test(await magentaLine.innerText()) && (await magentaLine.locator(".dispatch-remove", { hasText: "Undo" }).count()) === 1);
  await magentaLine.locator(".dispatch-remove", { hasText: "Undo" }).click(); await page.waitForTimeout(150);
  check("Undo restores the ordered quantity", (await magentaLine.locator(".qty-input").inputValue()) === "150");
  await magentaLine.locator(".dispatch-remove", { hasText: "Remove" }).click(); await page.waitForTimeout(150);
  dialogs = [];
  await card.locator("button", { hasText: "Confirm dispatch" }).click(); await page.waitForTimeout(300);
  check("the confirmation spells out the added and removed products", dialogs.length === 1 && /60 PC\(s\) across 1 added product/.test(dialogs[0]) && /1 ordered product\(s\) removed/.test(dialogs[0]), dialogs.join("|"));
  const done = (await orders())[0];
  check("order dispatched", done.status === "dispatched");
  check("Crystal: 300 deducted (1000 → 700)", (await physical("ring-boxes", 1)) === 700);
  check("Magenta (removed): nothing deducted (stays 400)", (await physical("ring-boxes", 2)) === 400);
  check("Emerald (added): 60 deducted (200 → 140)", (await physical("ring-boxes", 3)) === 140);
  const rec = Object.fromEntries(done.dispatchedLines.map((d) => [d.photoId, d]));
  check("record: Magenta removed=true, returned 150", rec[2].removed === true && rec[2].returned === 150 && rec[2].dispatched === 0);
  check("record: Emerald added=true, ordered 0, dispatched 60", rec[3].added === true && rec[3].ordered === 0 && rec[3].dispatched === 60 && rec[3].caption === "Emerald Diamond Box");
  const hist = await page.locator(".order-card-dispatched").innerText();
  check("history shows it plainly (removed / added)", /Magenta Diamond Box: removed from dispatch/.test(hist) && /Emerald Diamond Box: dispatched 60 PC\(s\) \(added to this dispatch\)/.test(hist), hist);

  console.log("\n8. Dispatch: added products can't touch stock reserved for another order");
  await reset({ "1": 1000, "2": 400, "3": 200 }, { ujp_orders: [seedApproved("a", "Shop A", [[1, 300, "Crystal Round Box"]]), seedApproved("b", "Shop B", [[3, 150, "Emerald Diamond Box"]])] });
  await adminTab("Dispatch");
  const cardA = page.locator(".order-card-approved", { hasText: "Shop A" });
  await cardA.locator(".dispatch-add-input").fill("emerald"); await page.waitForTimeout(150);
  check("picker shows only the FREE stock (200 − 150 reserved = 50)", /50 PC\(s\) free/.test(await cardA.innerText()));
  await cardA.locator(".dispatch-add-result").click(); await page.waitForTimeout(150);
  check("its max is 50", /Max you can send: 50/.test(await cardA.innerText()));
  await cardA.locator(".order-line-added .qty-input").fill("51");
  check("51 is refused", await cardA.locator("button", { hasText: "Confirm dispatch" }).isDisabled());
  await cardA.locator(".order-line-added .qty-input").fill("50");
  await cardA.locator("button", { hasText: "Confirm dispatch" }).click(); await page.waitForTimeout(250);
  check("50 accepted; Shop B's 150 still reserved and covered", (await physical("ring-boxes", 3)) === 150 && (await orders()).find((o) => o.id === "b").status === "approved");

  console.log("\n9. Dispatch: removing everything is refused");
  await reset({ "1": 1000 }, { ujp_orders: [seedApproved("c", "Shop C", [[1, 300, "Crystal Round Box"]])] });
  await adminTab("Dispatch");
  const cardC = page.locator(".order-card-approved");
  await cardC.locator(".dispatch-remove", { hasText: "Remove" }).click(); await page.waitForTimeout(150);
  check("confirm disabled with a hint to cancel instead", (await cardC.locator("button", { hasText: "Confirm dispatch" }).isDisabled()) && /at least one quantity above 0/.test(await cardC.innerText()));

  console.log("\n10. Core flow still works");
  await reset(); await role("customer"); await go("ring-boxes"); await addToCart(1, 2);
  await page.locator(".cart-float").click(); await page.locator(".cart-order-btn").click(); await page.waitForTimeout(250);
  check("customer order → pending, stock untouched, thank-you shown", (await orders())[0].status === "pending" && (await physical("ring-boxes", 1)) === 1000 && (await page.locator(".order-success").count()) === 1);
  await adminTab("Orders");
  await page.locator("button", { hasText: "Approve" }).first().click(); await page.waitForTimeout(200);
  check("approve → reserved, physical untouched", (await orders())[0].status === "approved" && (await physical("ring-boxes", 1)) === 1000);
  await page.locator(".admin-view-tab", { hasText: "Dispatch" }).click(); await page.waitForTimeout(200);
  await page.locator("button", { hasText: "Confirm dispatch" }).click(); await page.waitForTimeout(250);
  check("dispatch → physical deducted", (await physical("ring-boxes", 1)) === 700);

  console.log("\n11. One signed-in user at a time");
  await reset(); await role("customer"); await go("");
  check("customer signed in → Sales Rep + Admin buttons locked", (await page.locator(".banner-btn:disabled").count()) === 2);
  await go("admin");
  check("admin login replaced by a 'log out first' panel naming the customer", (await page.locator(".session-blocked-card").count()) === 1 && /Test Gold House/.test(await page.locator(".session-blocked-card").innerText()) && (await page.locator('.admin-login-card input[type="email"]').count()) === 0);
  await page.locator(".session-blocked-card button").click(); await page.waitForTimeout(250);
  check("after the customer logs out the admin form appears", (await page.locator('.admin-login-card input[type="email"]').count()) === 1 && (await ls("ujp_customer")) === null);
  await role("admin"); await go("sales");
  check("admin signed in → sales-rep login blocked", /Admin/.test(await page.locator(".session-blocked-card").innerText()));
  await role(null); await go("admin");
  await page.evaluate(() => localStorage.setItem("ujp_customer", JSON.stringify({ shopName: "Late Customer", location: "Town", mobile: "9876543210" })));
  await page.locator('.admin-login-card input[type="email"]').fill("unitedjewelpack@gmail.com");
  await page.locator('.admin-login-card input[type="password"]').fill("Ujp123$");
  await page.locator(".admin-login-submit").click(); await page.waitForTimeout(400);
  check("stale form + right password is STILL refused, with an explanation", (await page.evaluate(() => sessionStorage.getItem("ujp_admin_session"))) === null && /Late Customer/.test(await page.locator(".session-blocked-card").innerText().catch(() => "")));

  console.log("\n12. Staff cart: required details, welcome strip, WhatsApp content");
  await reset(); await role("rep"); await go("ring-boxes");
  check("banner says 'Welcome Sales Rep 1'", /Welcome Sales Rep 1/.test(await page.locator(".banner-who-text").innerText()));
  await addToCart(1, 1); await page.locator(".cart-float").click();
  check("rep sees the 3 required fields and the Miscellaneous section", (await page.locator("#cart-shopName, #cart-location, #cart-mobile").count()) === 3 && (await page.locator(".cart-extra-charge").count()) === 1);
  await page.locator(".cart-order-btn").click(); await page.waitForTimeout(150);
  check("empty details → blocked with 3 errors, no order", (await page.locator(".cart-shop-details .field-error-text").count()) === 3 && (await orders()).length === 0);
  await page.locator("#cart-shopName").fill("Kaveri Gold Palace"); await page.locator("#cart-location").fill("Madurai"); await page.locator("#cart-mobile").fill("98765 12345");
  await page.locator(".cart-order-btn").click(); await page.waitForTimeout(250);
  let o2 = (await orders())[0];
  check("order placed by the rep with the typed details; stock untouched", o2.placedBy === "salesRep" && o2.salesRepName === "Sales Rep 1" && o2.mobile === "9876512345" && (await physical("ring-boxes", 1)) === 1000);
  check("message carries details + Sales Rep line", /Shop Name: Kaveri Gold Palace/.test(await lastMsg()) && /Sales Rep: Sales Rep 1/.test(await lastMsg()));
  await role("customer"); await go("");
  check("customer: 'Welcome Test Gold House'", /Welcome Test Gold House/.test(await page.locator(".banner-who-text").innerText()));

  console.log("\n13. Round off + Miscellaneous section");
  await reset();
  await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("ujp_photo_patches")); p["ring-boxes"].prices["1"] = 7.33; localStorage.setItem("ujp_photo_patches", JSON.stringify(p)); });
  await role("customer"); await go("ring-boxes"); await addToCart(1, 1); await page.locator(".cart-float").click();
  const ro = await page.locator(".cart-roundoff").innerText();
  check("Amount ₹1,099.50 · Round off +₹0.50 · Total ₹1,100", /1,?099\.5/.test(ro) && /\+.*0\.5/.test(ro) && /1,?100\b/.test(await page.locator(".cart-total-row").innerText()), ro);
  check("customer does NOT see the Miscellaneous section", (await page.locator(".cart-extra-charge").count()) === 0);
  await page.locator(".cart-order-btn").click(); await page.waitForTimeout(250);
  const rm = await lastMsg();
  check("order stores total 1100 / round-off 0.5 and the message shows them", (await orders())[0].totalValue === 1100 && (await orders())[0].roundOff === 0.5 && /Round off: \+₹0\.5/.test(rm) && /— ₹1100/.test(rm), rm);

  console.log("\n14. Mock data loads and restores");
  await reset({ "1": 77 });
  await adminTab("Folders");
  await page.locator("button", { hasText: "Load mock data" }).click(); await page.waitForLoadState("load"); await page.waitForTimeout(500);
  check("15 sample orders + stock loaded", (await orders()).filter((x) => x.mock).length === 15 && (await physical("ring-boxes", 1)) !== 77);
  await page.locator("button", { hasText: "Remove mock data" }).click(); await page.waitForLoadState("load"); await page.waitForTimeout(500);
  check("remove restores the original stock and clears the samples", (await orders()).length === 0 && (await physical("ring-boxes", 1)) === 77 && (await ls("ujp_mock_meta")) === null);

  console.log("\n15. Inventory guard: can't clear stock that approved orders reserved");
  await reset({ "1": 1000 }, { ujp_orders: [seedApproved("g", "Guard Shop", [[1, 300, "Crystal Round Box"]])] });
  await adminTab("Inventory");
  const row = page.locator("tr", { hasText: "Crystal Round Box" }).first();
  await row.locator("button", { hasText: "Clear" }).click(); await page.waitForTimeout(200);
  check("stock unchanged and the reason is shown", (await physical("ring-boxes", 1)) === 1000 && /reserved for approved orders/.test(await row.innerText()));

  check("no runtime errors in the browser", errs.length === 0, errs.slice(0, 2).join(" | "));
  await browser.close(); server.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED (${passes} passed)\n` : `\nALL ${passes} CHECKS PASSED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("E2E crashed:", e); process.exit(2); });
