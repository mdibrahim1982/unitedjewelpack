import { useEffect, useState } from "react";
import Header from "./components/Header";
import FolderGrid from "./components/FolderGrid";
import PhotoGrid from "./components/PhotoGrid";
import AdminLogin from "./components/AdminLogin";
import AdminDashboard from "./components/AdminDashboard";
import SalesRepLogin from "./components/SalesRepLogin";
import CustomerLogin from "./components/CustomerLogin";
import SalesRepDashboard from "./components/SalesRepDashboard";
import Footer from "./components/Footer";
import WhatsAppFloat from "./components/WhatsAppFloat";
import BackToTopFloat from "./components/BackToTopFloat";
import CartFloat from "./components/CartFloat";
import CartModal from "./components/CartModal";
import { LanguageProvider, useLanguage } from "./i18n";
import { AuthProvider, useAuth } from "./auth";
import { SalesRepAuthProvider, useSalesRepAuth } from "./salesRepAuth";
import { PhotoStoreProvider, usePhotoStore } from "./photoStore";
import { CartProvider } from "./cartStore";
import { OrdersProvider } from "./ordersStore";
import { CustomerProvider, useCustomer } from "./customerStore";
import { PricingProvider } from "./pricingStore";

// ===================== routing =====================
// Simple hash-based routes (no react-router dependency needed):
//   #/                              → home (folder tiles)
//   #/admin                         → admin login, or dashboard if already signed in
//   #/sales                         → sales rep login, or dashboard if already signed in
//   #/<folder-slug>                 → that folder's photo grid
//   #/<folder-slug>?highlight=<id>  → same, with one photo highlighted/scrolled to
function parseRoute(hash, folderSlugs) {
  const withoutPrefix = hash.replace(/^#\/?/, "");
  const [raw, queryString] = withoutPrefix.split("?");
  if (raw === "admin") return { name: "admin" };
  if (raw === "sales") return { name: "sales" };
  if (folderSlugs.includes(raw)) {
    const params = new URLSearchParams(queryString || "");
    const highlightRaw = params.get("highlight");
    const highlightPhotoId = highlightRaw ? Number(highlightRaw) || highlightRaw : null;
    return { name: "folder", slug: raw, highlightPhotoId };
  }
  return { name: "home" };
}

function AppRoutes() {
  const { isAdmin } = useAuth();
  const { isSalesRep } = useSalesRepAuth();
  const { isCustomer } = useCustomer();
  const { t } = useLanguage();
  const { folders } = usePhotoStore();
  const folderSlugs = folders
    .filter((f) => !f.adminOnly)
    .map((f) => f.slug);

  const [route, setRoute] = useState(() =>
    parseRoute(window.location.hash, folderSlugs)
  );
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    const onHashChange = () =>
      setRoute(parseRoute(window.location.hash, folderSlugs));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.length]);

  function goHome() {
    window.location.hash = "";
    setRoute({ name: "home" });
  }

  function openFolder(slug) {
    window.location.hash = `/${slug}`;
    setRoute({ name: "folder", slug });
  }

  function openAdmin() {
    window.location.hash = "/admin";
    setRoute({ name: "admin" });
  }

  function openSalesRep() {
    window.location.hash = "/sales";
    setRoute({ name: "sales" });
  }

  // Anyone who isn't staff and hasn't given their shop details yet lands on
  // the Customer Login. The staff login routes stay reachable without it.
  const staffRoute = route.name === "admin" || route.name === "sales";
  const needsCustomerLogin = !isAdmin && !isSalesRep && !isCustomer && !staffRoute;

  return (
    <>
      <Header
        onLogoClick={goHome}
        onAdminClick={openAdmin}
        onSalesRepClick={openSalesRep}
      />

      <section className="slogan-section">
        <p className="slogan-text serif">{t("slogan")}</p>
      </section>

      {route.name === "admin" &&
        (isAdmin ? (
          <AdminDashboard onGoToSite={goHome} />
        ) : (
          <AdminLogin onSuccess={openAdmin} />
        ))}

      {route.name === "sales" &&
        (isSalesRep ? (
          <SalesRepDashboard onGoToSite={goHome} />
        ) : (
          <SalesRepLogin onSuccess={openSalesRep} />
        ))}

      {needsCustomerLogin && (
        <CustomerLogin onSalesRep={openSalesRep} onAdmin={openAdmin} />
      )}

      {!needsCustomerLogin && route.name === "folder" && (
        <PhotoGrid
          slug={route.slug}
          onBack={goHome}
          highlightPhotoId={route.highlightPhotoId}
        />
      )}

      {!needsCustomerLogin && route.name === "home" && (
        <FolderGrid onOpenFolder={openFolder} />
      )}

      <Footer />
      {!needsCustomerLogin && (
        <CartFloat onClick={() => setCartOpen(true)} />
      )}
      {cartOpen && !needsCustomerLogin && (
        <CartModal onClose={() => setCartOpen(false)} />
      )}
      <WhatsAppFloat />
      <BackToTopFloat />
    </>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <SalesRepAuthProvider>
         <CustomerProvider>
          <PhotoStoreProvider>
            <OrdersProvider>
              <CartProvider>
                <PricingProvider>
                  <AppRoutes />
                </PricingProvider>
              </CartProvider>
            </OrdersProvider>
          </PhotoStoreProvider>
         </CustomerProvider>
        </SalesRepAuthProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
