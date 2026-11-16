// Browser test of the FIREBASE code path (sign-in with roles, Firestore-backed
// stock and orders, approve → dispatch, migration). The app is built with
// VITE_BACKEND=memory, so an in-memory Firebase stands in for the real one —
// no network or emulator needed. It exercises the app's own logic end to end;
// the real SDK wrapper and the Security Rules are covered by `npm run test:rules`.
//
//   node tests/e2e/firebase.cjs
const { startApp, OPEN_STUB } = require("./harness.cjs");

let failures = 0, passes = 0;
const check = (name, ok, extra = "") => { if (ok) { passes++; console.log(`  ✓ ${name}`); } else { failures++; console.log(`  ✗ ${name} ${extra}`); } };

const ACCOUNTS = [
  { email: "boss@x.in", password: "Boss#123", uid: "u-admin" },
  { email: "rep1@x.in", password: "Rep#123", uid: "u-rep1" },
  { email: "rep2@x.in", password: "Rep#456", uid: "u-rep2" },
  { email: "gone@x.in", password: "Gone#123", uid: "u-gone" },
  { email: "nobody@x.in", password: "Nobody#1", uid: "u-nobody" },
];
const inv = (physical, reserved = 0, price = 8) => ({ physical, reserved, price });
const BASE_DOCS = {
  "admins/u-admin": { name: "Owner" },
  "salesReps/u-rep1": { name: "Ravi Kumar", email: "rep1@x.in", active: true },
  "salesReps/u-rep2": { name: "Meena S", email: "rep2@x.in", active: true },
  "salesReps/u-gone": { name: "Left Co", email: "gone@x.in", active: false },
  "inventory/ring-boxes:1": inv(1000),
  "inventory/ring-boxes:2": inv(400),
};
const CUST = { shopName: "Test Gold House", location: "Tirunelveli", mobile: "9876543210" };
const order = (id, o = {}) => ({ id, status: "pending", createdAt: "2026-01-0" + (1 + (id.length % 8)) + "T00:00:00.000Z", shopName: "Other Shop", location: "Town", mobile: "9000011111", placedBy: "customer", salesRepName: "", customerUid: "c-x", itemsTotal: 0, totalValue: 0, lines: [{ key: "ring-boxes:1", folderId: "ring-boxes", photoId: 1, caption: "Crystal Round Box", pieces: 300 }], ...o });

(async () => {
  const app = await startApp({ backend: "memory" });
  const { BASE, browser } = app;
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("dialog", (d) => d.accept().catch(() => {}));
  await page.addInitScript(OPEN_STUB);

  const dump = () => page.evaluate(() => JSON.parse(localStorage.getItem("ujp_memory_firestore") || "{}"));
  const doc = async (p) => (await dump())[p]?.data;
  const ordersInDb = async () => Object.entries(await dump()).filter(([p]) => p.startsWith("orders/")).map(([, e]) => e.data);
  const waMsg = () => page.evaluate(() => { const u = window.__opened.filter((x) => /^https:\/\/wa\.me\//.test(x)).slice(-1)[0]; return u ? decodeURIComponent(new URL(u).searchParams.get("text") || "") : null; });

  async function seed(docs = BASE_DOCS, extraLocal = {}) {
    await page.goto(BASE);
    await page.evaluate(([accounts, docs, extra]) => {
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem("ujp_photo_prices_reset_v1", "1");
      localStorage.setItem("ujp_memory_accounts", JSON.stringify(accounts));
      const db = {}; for (const [p, d] of Object.entries(docs)) db[p] = { data: d, version: 1 };
      localStorage.setItem("ujp_memory_firestore", JSON.stringify(db));
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, JSON.stringify(v));
    }, [ACCOUNTS, docs, extraLocal]);
  }
  const go = async (hash) => { await page.goto(`${BASE}#/${hash}`); await page.reload(); await page.waitForTimeout(350); };
  const asCustomer = async () => { await page.evaluate((c) => { localStorage.setItem("ujp_customer", JSON.stringify(c)); }, CUST); };
  async function signIn(path, email, password) {
    await go(path);
    await page.locator('.admin-login-card input[type="email"]').fill(email);
    await page.locator('.admin-login-card input[type="password"]').fill(password);
    await page.locator(".admin-login-submit").click();
    await page.waitForTimeout(500);
  }
  const user = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("ujp_memory_user") || "null"));
  const addToCart = async (id, packs) => {
    const c = page.locator(`#photo-${id}`);
    await c.locator(".qty-input").fill(String(packs)); await c.locator(".qty-input").blur();
    await c.locator(".add-to-cart-btn").click(); await page.waitForTimeout(120);
  };
  const adminTab = async (name) => { await page.locator(".admin-view-tab", { hasText: name }).click(); await page.waitForTimeout(250); };
  const logout = async () => { await page.locator(".header-logout-btn").click(); await page.waitForTimeout(400); };

  // ===================================================================
  console.log("\n1. Admin sign-in (Firebase Authentication + admins/{uid})");
  await seed();
  await signIn("admin", "boss@x.in", "wrong");
  check("wrong password → clear message, nobody signed in", /Incorrect email or password/.test(await page.locator(".field-error").innerText()) && (await user()) === null);
  await signIn("admin", "rep1@x.in", "Rep#123");
  check("a sales rep's login on the ADMIN form is refused and signed back out", /different role/.test(await page.locator(".field-error").innerText()) && (await user()) === null);
  await signIn("admin", "nobody@x.in", "Nobody#1");
  check("a Firebase account with no role document is refused ('not set up')", /isn't set up/.test(await page.locator(".field-error").innerText()) && (await user()) === null);
  await signIn("admin", "boss@x.in", "Boss#123");
  check("the admin signs in and reaches the dashboard", (await page.locator(".admin-view-tabs").count()) === 1 && /Welcome Admin/.test(await page.locator(".banner-who-text").innerText()));
  await page.reload(); await page.waitForTimeout(500);
  check("the session survives a reload (Firebase restores the user)", (await page.locator(".admin-view-tabs").count()) === 1);
  check("the browser-only 'Test data' bar is replaced by the Firebase panel", (await page.locator(".firebase-panel").count()) === 1 && (await page.locator("button", { hasText: "Load mock data" }).count()) === 0);
  await logout();
  check("logout signs out of Firebase too", (await user()) === null && (await page.locator('.admin-login-card input[type="email"]').count()) === 1);

  console.log("\n2. Sales rep sign-in (salesReps/{uid})");
  await signIn("sales", "rep1@x.in", "Rep#123");
  check("rep signs in; name comes from Firestore: 'Welcome Ravi Kumar'", /Welcome Ravi Kumar/.test(await page.locator(".banner-who-text").innerText()));
  await logout();
  await signIn("sales", "gone@x.in", "Gone#123");
  check("a deactivated rep (active:false) cannot sign in", /isn't set up/.test(await page.locator(".field-error").innerText()) && (await user()) === null);
  await signIn("sales", "boss@x.in", "Boss#123");
  check("the admin's login on the SALES REP form is refused", /different role/.test(await page.locator(".field-error").innerText()) && (await user()) === null);

  console.log("\n3. Stock and prices come from Firestore (not from this browser)");
  await seed({ ...BASE_DOCS, "inventory/ring-boxes:2": inv(400, 100, 8) }, { ujp_photo_patches: { "ring-boxes": { stock: { "1": 5 }, prices: { "1": 99 }, added: [], edits: {}, deletedIds: [] } } });
  await asCustomer(); await go("ring-boxes");
  check("shows Firestore stock 1000 — the stale local value (5) is ignored", /1000/.test(await page.locator("#photo-1 .stock-label").innerText()));
  check("shows available = physical − reserved (400 − 100 = 300)", /300/.test(await page.locator("#photo-2 .stock-label").innerText()));
  check("shows the Firestore price ₹8 (not the stale local ₹99)", /₹8 \/ pc/.test(await page.locator("#photo-1").innerText()));

  console.log("\n4. Customer order → pending in Firestore, NO stock change");
  await seed(); await asCustomer(); await go("ring-boxes"); await addToCart(1, 2);
  await page.locator(".cart-float").click(); await page.locator(".cart-order-btn").click(); await page.waitForTimeout(700);
  let orders = await ordersInDb();
  check("one pending order was written to Firestore", orders.length === 1 && orders[0].status === "pending" && orders[0].placedBy === "customer");
  check("it carries the shop details and an anonymous customer uid", orders[0].shopName === CUST.shopName && orders[0].mobile === CUST.mobile && /^anon-/.test(orders[0].customerUid));
  check("inventory is untouched (physical 1000, reserved 0)", (await doc("inventory/ring-boxes:1")).physical === 1000 && (await doc("inventory/ring-boxes:1")).reserved === 0);
  const msg = await waMsg();
  check("WhatsApp opened (blank tab first, filled after saving) with the order ref + details", /Shop Name: Test Gold House/.test(msg) && new RegExp("#" + orders[0].id.slice(-5).toUpperCase()).test(msg), msg);
  check("thank-you card shown and the cart emptied", (await page.locator(".order-success").count()) === 1);

  console.log("\n5. Sales rep order + each rep sees only their own");
  await seed({ ...BASE_DOCS, "orders/theirs": order("theirs", { placedBy: "salesRep", salesRepUid: "u-rep2", salesRepName: "Meena S", customerUid: undefined }) });
  await signIn("sales", "rep1@x.in", "Rep#123");
  await go("ring-boxes"); await addToCart(1, 1);
  await page.locator(".cart-float").click();
  await page.locator("#cart-shopName").fill("Kaveri Gold Palace"); await page.locator("#cart-location").fill("Madurai"); await page.locator("#cart-mobile").fill("9876512345");
  await page.locator(".cart-order-btn").click(); await page.waitForTimeout(700);
  const mine = (await ordersInDb()).find((o) => o.shopName === "Kaveri Gold Palace");
  check("rep order stored with salesRepUid and the rep's name", mine && mine.salesRepUid === "u-rep1" && mine.salesRepName === "Ravi Kumar" && mine.placedBy === "salesRep");
  await go("sales"); await page.waitForTimeout(300);
  const dash = await page.locator("body").innerText();
  check("'My orders' lists their order", /Kaveri Gold Palace/.test(dash));
  check("…and NOT another rep's order", !/Other Shop/.test(dash));
  await logout();

  console.log("\n6. Admin: approve → reserve, dispatch → deduct once");
  await seed({ ...BASE_DOCS, "orders/o-cust": order("o-cust", { shopName: "Cust Shop" }) });
  await signIn("admin", "boss@x.in", "Boss#123");
  await adminTab("Orders");
  check("admin sees the pending order", (await page.locator(".order-card-pending", { hasText: "Cust Shop" }).count()) === 1);
  await page.locator("button", { hasText: "Approve" }).first().click(); await page.waitForTimeout(600);
  let o = await doc("orders/o-cust");
  check("approve: order approved, reserved 300, physical unchanged", o.status === "approved" && (await doc("inventory/ring-boxes:1")).reserved === 300 && (await doc("inventory/ring-boxes:1")).physical === 1000);
  await adminTab("Inventory");
  const cells = await page.locator("tr", { hasText: "Crystal Round Box" }).first().locator("td.admin-inventory-current-cell").allInnerTexts();
  check("Inventory tab shows physical/reserved/available = 1000/300/700", cells.join("/") === "1000/300/700", cells.join("/"));
  await adminTab("Dispatch");
  await page.locator(".order-card-approved .qty-input").first().fill("200");
  await page.locator("button", { hasText: "Confirm dispatch" }).dblclick({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  o = await doc("orders/o-cust");
  check("dispatch: status dispatched, stockDeducted true", o.status === "dispatched" && o.stockDeducted === true);
  check("physical 1000 → 800 (deducted ONCE, despite the double click), reservation released", (await doc("inventory/ring-boxes:1")).physical === 800 && (await doc("inventory/ring-boxes:1")).reserved === 0);
  check("record: ordered 300 / dispatched 200 / returned 100", o.dispatchedLines[0].dispatched === 200 && o.dispatchedLines[0].returned === 100);

  console.log("\n7. Competing approvals can't over-reserve (stock 500, two orders of 300)");
  await seed({ ...BASE_DOCS, "inventory/ring-boxes:1": inv(500), "orders/a1": order("a1", { shopName: "Shop A1" }), "orders/a2": order("a2", { shopName: "Shop A2" }) });
  await signIn("admin", "boss@x.in", "Boss#123"); await adminTab("Orders");
  await page.locator(".order-card-pending", { hasText: "Shop A1" }).locator("button", { hasText: "Approve" }).click(); await page.waitForTimeout(500);
  await page.locator(".order-card-pending", { hasText: "Shop A2" }).locator("button", { hasText: "Approve" }).click(); await page.waitForTimeout(500);
  check("the second approval is refused with a clear message", (await page.locator(".cart-notice-error").count()) === 1 && (await doc("orders/a2")).status === "pending");
  check("reserved stays 300 (never above physical)", (await doc("inventory/ring-boxes:1")).reserved === 300);

  console.log("\n8. Manual stock edit goes to Firestore; reserved stock is protected");
  await seed({ ...BASE_DOCS, "inventory/ring-boxes:1": inv(1000, 300), "inventory/ring-boxes:2": inv(400, 0), "orders/ap": order("ap", { status: "approved", reservedLines: [{ key: "ring-boxes:1", pieces: 300 }], approvedAt: "t" }) });
  await signIn("admin", "boss@x.in", "Boss#123"); await adminTab("Inventory");
  const row1 = page.locator("tr", { hasText: "Crystal Round Box" }).first();
  await row1.locator("button", { hasText: "Clear" }).click(); await page.waitForTimeout(400);
  check("clearing stock that approved orders reserved is refused (unchanged)", (await doc("inventory/ring-boxes:1")).physical === 1000 && /reserved for approved orders/.test(await row1.innerText()));
  const row2 = page.locator("tr", { hasText: "Magenta Diamond Box" }).first();
  await row2.locator("button", { hasText: "Clear" }).click(); await page.waitForTimeout(600);
  check("clearing unreserved stock writes physical 0 to Firestore", (await doc("inventory/ring-boxes:2")).physical === 0);

  console.log("\n9. Migration: this browser's old data → Firestore, once");
  const localPatches = { "ring-boxes": { deletedIds: [], edits: {}, prices: { "1": 8, "2": 7.5 }, stock: { "1": 1000, "2": 400 }, added: [] } };
  const localOrders = [
    { id: "old-approved", status: "approved", createdAt: "2026-01-01T00:00:00Z", shopName: "Old Shop", location: "Town", mobile: "9000011111", lines: [{ key: "ring-boxes:1", folderId: "ring-boxes", photoId: 1, caption: "x", pieces: 300 }], reservedLines: [{ key: "ring-boxes:1", pieces: 300 }], placedBy: "customer", salesRepName: "", totalValue: 0, itemsTotal: 0 },
    { id: "old-pending", status: "pending", createdAt: "2026-01-02T00:00:00Z", shopName: "Old Shop 2", location: "Town", mobile: "9000011112", lines: [{ key: "ring-boxes:2", folderId: "ring-boxes", photoId: 2, caption: "y", pieces: 100 }], placedBy: "customer", salesRepName: "", totalValue: 0, itemsTotal: 0 },
    { id: "mock-X", mock: true, status: "dispatched", createdAt: "2026-01-03T00:00:00Z", lines: [] },
  ];
  const docsNoInv = Object.fromEntries(Object.entries(BASE_DOCS).filter(([p]) => !p.startsWith("inventory/")));
  await seed(docsNoInv, { ujp_photo_patches: localPatches, ujp_orders: localOrders });
  await signIn("admin", "boss@x.in", "Boss#123");
  check("the panel offers to copy the local data", /still holds 2 products.*2 orders/.test(await page.locator(".firebase-panel").innerText()) && (await page.locator("button", { hasText: "Copy to Firebase" }).count()) === 1);
  await page.locator("button", { hasText: "Copy to Firebase" }).click(); await page.waitForTimeout(900);
  check("inventory copied (stock, price, reserved from the approved order)", (await doc("inventory/ring-boxes:1")).physical === 1000 && (await doc("inventory/ring-boxes:1")).reserved === 300 && (await doc("inventory/ring-boxes:1")).price === 8 && (await doc("inventory/ring-boxes:2")).price === 7.5);
  check("real orders copied, the sample (mock) order is not", (await doc("orders/old-approved")).status === "approved" && (await doc("orders/old-pending")) && !(await doc("orders/mock-X")));
  check("local data is untouched (kept as a backup)", (await page.evaluate(() => JSON.parse(localStorage.getItem("ujp_orders")).length)) === 3 && (await page.evaluate(() => JSON.parse(localStorage.getItem("ujp_photo_patches"))["ring-boxes"].stock["1"])) === 1000);
  check("marked done, and the copy button is gone", (await doc("meta/migration")).status === "done" && (await page.locator("button", { hasText: "Copy to Firebase" }).count()) === 0);

  console.log("\n10. One signed-in user at a time still holds in Firebase mode");
  await seed(); await asCustomer(); await go("admin");
  check("a signed-in customer blocks the admin sign-in form", (await page.locator(".session-blocked-card").count()) === 1);

  check("no runtime errors in the browser", errs.length === 0, errs.slice(0, 2).join(" | "));
  await app.close();
  console.log(failures ? `\n${failures} CHECK(S) FAILED (${passes} passed)\n` : `\nALL ${passes} CHECKS PASSED\n`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error("E2E crashed:", e); process.exit(2); });
