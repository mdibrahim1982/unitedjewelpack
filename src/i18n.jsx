import { createContext, useContext, useEffect, useState } from "react";

// ===================== translations =====================
// Add a new key here and it becomes available via t("yourKey") in any
// component that calls useLanguage(). Add a new language by adding a new
// top-level key (e.g. "hi") and translating every string below.
const STRINGS = {
  en: {
    brandName: "United Jewel Pack",
    brandPlace: "Melapalayam · Tirunelveli",
    call: "Call",
    whatsappUs: "WhatsApp Us",
    homeTitle: "Jewel Boxes",
    homeSubtitle: "Choose a collection to browse its photos.",
    slogan:
      "We're into the field of providing best customer service of jewellery packing materials for more than 10 years with head office located in Kozhikode.",
    photoCount_one: "{n} photo",
    photoCount_other: "{n} photos",
    backToHome: "← Back to Jewel Boxes",
    noPhotosYet: "No photos in this folder yet — check back soon.",
    folderNotFound: "That folder doesn't exist.",
    footerTagline: "Retail packaging materials for jewellery showrooms",
    getInTouch: "Get in touch",
    messageOnWhatsApp: "Message on WhatsApp",
    adminLink: "Admin",

    // admin
    adminLoginTitle: "Admin Login",
    adminLoginSubtitle: "Sign in to manage folders and photos.",
    email: "Email",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    signIn: "Sign in",
    invalidCredentials: "Incorrect email or password.",
    logout: "Log out",
    adminDashboard: "Admin Dashboard",
    adminDashboardSubtitle:
      "Add photos, rename them, set a unit price, or move them to Backup.",
    backToSite: "← Back to site",

    // sales rep
    salesRepLink: "Sales Rep",
    salesRepLoginTitle: "Sales Rep Login",
    salesRepLoginSubtitle: "Sign in to place orders under your name.",
    salesRepDashboardTitle: "Sales Rep Dashboard",
    salesRepWelcome: "Welcome, {name}.",
    salesRepDashboardNote:
      "You're signed in — your name will be included on any WhatsApp order you place from here.",
    salesRepBrowseSite: "Browse the catalogue",
    selectFolder: "Select a folder to manage",
    addPhoto: "Add photos",
    uploadPhoto: "Upload photos",
    uploadPhotoHint: "You can select more than one image at a time.",
    uploadingPhotos: "Uploading…",
    save: "Save",
    cancel: "Cancel",
    backupBtn: "Backup",
    edit: "Edit",
    editPrice: "Edit Price",
    savePrice: "Save Price",
    unitPriceLabel: "Unit price",
    unitPricePlaceholder: "Rate per pc (₹)",
    clearPrice: "Use default",
    confirmDelete:
      "Move this photo to Backup? You can restore it from there anytime.",
    photosInFolder: "Photos in this folder",
    noPhotosAdmin: "No photos yet. Add one below.",
    changesSavedNote:
      "Changes are saved in this browser only (no server is connected).",

    // backup / restore (admin only)
    backupFoldersLabel: "Backup (Admin Only)",
    searchInFolderPlaceholder: "Search photos in this folder…",
    clearSearch: "Clear search",
    searchNoResults: "No photos match \"{query}\".",
    backupFolderNote:
      "Deleted photos from the matching folder land here. Restore them or delete them for good.",
    noPhotosBackup: "No deleted photos here right now.",
    restorePhoto: "Restore",
    deletePermanently: "Delete Permanently",
    confirmPermanentDelete:
      "Permanently delete this photo? This can't be undone.",
    selectMultiple: "Select Multiple",
    cancelSelectMultiple: "Cancel",
    selectAllBtn: "Select All",
    bulkSelectedCount_one: "{n} selected",
    bulkSelectedCount_other: "{n} selected",
    deleteSelectedBtn: "Delete Selected",
    backupDeletedBtn: "Backup Deleted",
    confirmBulkDelete_one:
      "Permanently delete {n} selected photo? This can't be undone.",
    confirmBulkDelete_other:
      "Permanently delete {n} selected photos? This can't be undone.",
    confirmBulkDeleteNormal_one:
      "Move {n} selected photo to Backup? You can restore it from there anytime.",
    confirmBulkDeleteNormal_other:
      "Move {n} selected photos to Backup? You can restore them from there anytime.",

    // language switch
    language: "Language",

    // cart
    addToCart: "Add to Cart",
    addMoreToCart: "Add More",
    addedToCart: "Added ✓",
    inCartBtn: "✓ In Cart",
    inCartQtyGrPcLabel: "In cart: {qty} GR(s) or {pcs} PC(s)",
    inCartQtyGrLabel: "In cart: {qty} GR(s)",
    cartLineGr: "{qty} GR(s)",
    cartLineGrPc: "{qty} GR(s) or {pcs} PC(s)",
    qtyLabel: "Qty (packs)",
    decreaseQty: "Decrease quantity",
    increaseQty: "Increase quantity",
    checkoutCart: "Checkout Cart",
    yourCart: "Your Cart",
    closeCart: "Close cart",
    emptyCart: "Your cart is empty. Add some boxes to get started.",
    removeItem: "Remove item",
    cartItemCount_one: "{n} item",
    cartItemCount_other: "{n} items",
    totalQtyLabel: "Total qty",
    clearCart: "Clear cart",
    placeOrderWhatsApp: "Place Order via WhatsApp",
    rateLabel: "Rate",
    subtotalLabel: "Subtotal",
    totalValueLabel: "Total value",
    inStockLabel: "In stock",
    stockLimitError:
      "Only {available} {unit} in stock ({inCart} already in your cart).",

    // admin: inventory list view
    foldersTab: "📁 Folders",
    inventoryTab: "📦 Inventory",
    inventoryTitle: "Inventory",
    inventoryNote:
      "Set how many pieces (PC) are in stock for each item. GR(s) is calculated automatically (PC ÷ 150) and customers can't add more than this to their cart.",
    inventoryTotalCount_one: "{n} item in inventory",
    inventoryTotalCount_other: "{n} items in inventory",
    inventoryFilteredCount: "{count} of {total} items shown",
    photoColumnLabel: "Products",
    folderColumnLabel: "Folder",
    viewItemOnSite: "View this item on the site",
    pcsColumnLabel: "PC(s)",
    currentStockColumnLabel: "Current Stock",
    stockAdjustColumnLabel: "STOCK(+)/(-)",
    damageColumnLabel: "DAMAGE",
    addStockTooltip: "Add to stock",
    subtractStockTooltip: "Deduct from stock",
    markDamageTooltip: "Mark as damaged",
    grColumnLabel: "GR(s)",
    clearStockColumnLabel: "Clear Stock",
    clearStockBtn: "Clear",
    noStockSet: "No limit",
    okLabel: "OK",
    stockAddConfirmTitle: "Add stock?",
    stockSubtractConfirmTitle: "Deduct stock?",
    damageConfirmTitle: "Record damage?",
    stockAddConfirmMessage:
      "Add {delta} pc to the current stock of {base} pc? New stock will be {next} pc.",
    stockSubtractConfirmMessage:
      "Deduct {delta} pc from the current stock of {base} pc? New stock will be {next} pc.",
    damageConfirmMessage:
      "Mark {delta} pc as damaged and remove from the current stock of {base} pc? New stock will be {next} pc.",
    stockExceedsCurrentError:
      "Cannot deduct {delta} pc — only {base} pc in current stock.",
    // mock / test data (admin)
    mockTitle: "Test data",
    mockInactiveNote:
      "Fill the app with sample stock, prices and orders to try the whole workflow. Your current stock and prices are saved first and restored when you remove it.",
    mockActiveNote:
      "Mock data is loaded: {products} products stocked, {orders} sample orders.",
    mockHelp:
      "Try it: the first 8 photos of the first folder have stock 1000 / 400 / 150 / 75 / 74 / 30 / 1 / 0. Sign in as a sales rep (rep1@unitedjewelpack.com / Rep123$) to place orders. Orders → 5 pending (P2 fits only until P1 is approved; two are already short); Dispatch → 3 approved.",
    mockLoad: "Load mock data",
    mockReload: "Reload mock data",
    mockRemove: "Remove mock data",
    mockLoadConfirm:
      "Replace the current stock, prices and orders with sample data? Your previous stock and prices are saved and come back when you remove it. Photos and captions are not touched.",
    mockRemoveConfirm:
      "Remove the sample orders and restore your previous stock and prices?",
    mockLoaded: "Mock data loaded: {products} products stocked, {orders} sample orders.",
    mockRemoved: "Mock data removed — your previous stock and prices are restored.",
    mockErrActive:
      "Can't load mock data while real orders are pending or approved. Finish or cancel them first.",
    mockErrGeneric: "Couldn't complete that. Nothing was changed.",
    welcomeUser: "Welcome {name}",
    orderSuccessTitle: "Your order has been placed successfully!",
    orderSuccessThanks: "Thank you, {name}.",
    orderSuccessBody:
      "We'll dispatch it once we've checked availability. We really appreciate your business.",
    orderSuccessStaffBody:
      "The order for {name} was sent to the admin on WhatsApp and is now pending approval.",
    orderSuccessRef: "Order ref: #{ref}",
    amountLabel: "Amount",
    roundOffLabel: "Round off",
    // one signed-in user at a time
    role_admin: "Admin",
    role_salesRep: "Sales Rep",
    role_customer: "Customer",
    sessionBlockedTitle: "Someone is already signed in",
    sessionBlockedText:
      "{who} is signed in on this device. They need to log out before {requested} can sign in.",
    sessionBlockedLogout: "Log out {who}",
    sessionLockedHint: "Log out first to switch user",
    // customer login / required details / banner
    customerLoginTitle: "Welcome",
    customerLoginSubtitle: "Tell us about your shop to browse and place orders.",
    customerLoginContinue: "Continue to catalogue",
    customerLoginNote: "Saved on this device, so you won't be asked again.",
    customerLoginStaff: "Staff?",
    fieldRequired: "This field is required.",
    mobileInvalid: "Enter a valid 10-digit mobile number.",
    customerDetailsTitle: "Customer details (required)",
    orderDetailsRequired: "Please fill in Shop Name, Location and Mobile before placing the order.",
    orderPlacedByCustomer: "Customer",
    orderPlacedByAdmin: "Admin",
    // dispatch: increase / decrease
    dispatchDecrease: "Decrease by {n} PC",
    dispatchIncrease: "Increase by {n} PC",
    dispatchAsOrdered: "as ordered",
    dispatchLess: "{n} less than ordered",
    dispatchMore: "{n} more than ordered",
    dispatchMaxLabel: "Max you can send",
    dispatchErrAvailable: "Only {n} PC(s) can be sent — the rest is reserved for other approved orders.",
    dispatchConfirmBase: "Dispatch {total} PC(s) and deduct them from stock.",
    dispatchConfirmReturned: "{returned} PC(s) not sent go back to available.",
    dispatchConfirmExtra: "{extra} PC(s) above the ordered quantity come from free stock.",
    dispatchConfirmFinal: "This can't be undone.",
    orderExtraLabel: "above ordered",
    orderErrAvailable: "{item}: only {max} PC(s) can be sent — the rest is reserved for other approved orders.",
    // order approval / reservation / dispatch workflow
    ordersTab: "🧾 Orders",
    dispatchTab: "🚚 Dispatch",
    ordersNote:
      "Orders from customers, sales reps and admin wait here. Approving reserves the quantities (physical stock is not touched); rejecting or cancelling changes no stock.",
    ordersPendingHeading: "Pending approval",
    ordersNonePending: "No orders waiting for approval.",
    ordersHistoryHeading: "History",
    approveBtn: "Approve & reserve",
    rejectBtn: "Reject",
    cancelOrderBtn: "Cancel order",
    orderApproved: "Order approved — the quantities are now reserved.",
    orderRejected: "Order rejected. No stock was changed.",
    orderCancelled: "Order cancelled.",
    orderCancelledReleased: "Order cancelled — its reservation was released.",
    orderedLabel: "Ordered",
    availableNowLabel: "Available now",
    onHandLabel: "On hand",
    orderNoShop: "(no shop name)",
    orderSalesRep: "Sales rep",
    orderStatus_pending: "Pending",
    orderStatus_approved: "Approved",
    orderStatus_dispatched: "Dispatched",
    orderStatus_rejected: "Rejected",
    orderStatus_cancelled: "Cancelled",
    orderDispatchedLabel: "dispatched",
    orderReturnedLabel: "returned to available",
    orderErrInsufficient: "Not enough available stock — {items}.",
    orderErrStatus: "This order has already been processed. The list was refreshed.",
    orderErrExceeds: "{item}: dispatch quantity can't exceed what was ordered.",
    orderErrQty: "Enter a whole number (0 or more) for every product.",
    orderErrPhysical: "{item}: not enough physical stock on hand.",
    orderErrNothing: "Enter at least one quantity above 0, or cancel the order instead.",
    orderErrGeneric: "Something went wrong. Nothing was changed.",
    dispatchNote:
      "Enter what was actually sent — less or more than ordered. Confirming deducts exactly that from physical stock and releases the reservation, so anything approved but not sent becomes available again. Sending more than ordered uses free stock only.",
    dispatchHeading: "Approved — ready to dispatch",
    dispatchNone: "No approved orders waiting for dispatch.",
    dispatchedHeading: "Dispatched",
    dispatchQtyLabel: "Dispatch qty (PC)",
    dispatchErrWhole: "Whole number, 0 or more.",
    dispatchErrOrdered: "Can't exceed the ordered {n} PC(s).",
    dispatchErrPhysical: "Only {n} PC(s) on hand.",
    confirmDispatchBtn: "Confirm dispatch",
    dispatchConfirmText:
      "Dispatch {total} PC(s) and deduct them from stock? {returned} PC(s) not sent will go back to available. This can't be undone.",
    dispatchDone: "Dispatch confirmed — physical stock updated.",
    cancelApprovedConfirm:
      "Cancel this approved order? The reserved stock will be released. Nothing is deducted.",
    submitForApproval: "Submit for admin approval",
    orderSubmittedForApproval:
      "Order placed — it's been sent to the admin on WhatsApp and is now pending approval. No stock has been changed.",
    orderSubmitFailed: "The order couldn't be submitted. Please try again.",
    salesRepMyOrders: "My orders",
    salesRepNoOrders: "You haven't submitted any orders yet.",
    reservedColumnLabel: "Reserved",
    availableColumnLabel: "Available",
    stockBelowReservedError:
      "{reserved} PC(s) are reserved for approved orders — stock can't go below that.",
    shopNameLabel: "Shop Name:",
    shopNamePlaceholder: "Enter shop name",
    locationLabel: "Location:",
    locationPlaceholder: "Enter location",
    mobileLabel: "Mobile:",
    mobilePlaceholder: "Enter mobile number",
    noExtraChargeLabel: "Miscellaneous",
    extraAmountLabel: "Extra amount (₹)",

    // pricing settings (admin only)
    priceSaved: "Price updated ✓",

    // bulk restore (backup folders, admin only)
    restoreSelectedBtn: "Restore Selected",
    confirmRestoreSelected_one:
      "Restore {n} selected photo back to its original folder?",
    confirmRestoreSelected_other:
      "Restore {n} selected photos back to their original folders?",
  },
  ta: {
    brandName: "யுனைடெட் ஜூவல் பேக்",
    brandPlace: "மேலப்பாளையம் · திருநெல்வேலி",
    call: "அழைக்க",
    whatsappUs: "வாட்ஸ்அப்",
    homeTitle: "நகை பெட்டிகள்",
    homeSubtitle: "புகைப்படங்களை பார்க்க ஒரு தொகுப்பைத் தேர்ந்தெடுக்கவும்.",
    slogan:
      "10 ஆண்டுகளுக்கும் மேலாக நகை பேக்கிங் பொருட்களுக்கான சிறந்த வாடிக்கையாளர் சேவையை வழங்கி வருகிறோம் — தலைமை அலுவலகம் கோழிக்கோடு.",
    photoCount_one: "{n} புகைப்படம்",
    photoCount_other: "{n} புகைப்படங்கள்",
    backToHome: "← நகை பெட்டிகளுக்குத் திரும்பு",
    noPhotosYet: "இந்த கோப்புறையில் இன்னும் புகைப்படங்கள் இல்லை — விரைவில் பாருங்கள்.",
    folderNotFound: "இந்த கோப்புறை இல்லை.",
    footerTagline: "நகைக்கடைகளுக்கான சில்லறை பேக்கேஜிங் பொருட்கள்",
    getInTouch: "தொடர்பு கொள்ள",
    messageOnWhatsApp: "வாட்ஸ்அப்பில் செய்தி அனுப்பவும்",
    adminLink: "நிர்வாகி",

    // admin
    adminLoginTitle: "நிர்வாகி உள்நுழைவு",
    adminLoginSubtitle: "கோப்புறைகள் மற்றும் புகைப்படங்களை நிர்வகிக்க உள்நுழையவும்.",
    email: "மின்னஞ்சல்",
    password: "கடவுச்சொல்",
    showPassword: "கடவுச்சொல்லைக் காட்டு",
    hidePassword: "கடவுச்சொல்லை மறை",
    signIn: "உள்நுழைக",
    invalidCredentials: "மின்னஞ்சல் அல்லது கடவுச்சொல் தவறு.",
    logout: "வெளியேறு",
    adminDashboard: "நிர்வாகி பலகை",
    adminDashboardSubtitle:
      "புகைப்படங்களைச் சேர்க்கவும், மறுபெயரிடவும், அலகு விலையை அமைக்கவும் அல்லது பேக்அப்பிற்கு நகர்த்தவும்.",
    backToSite: "← தளத்திற்குத் திரும்பு",

    // customer login / welcome / order confirmation (Tamil)
    customerLoginTitle: "வரவேற்கிறோம்",
    customerLoginSubtitle: "உலாவவும் ஆர்டர் செய்யவும் உங்கள் கடை விவரங்களைத் தெரிவிக்கவும்.",
    customerLoginContinue: "பட்டியலுக்குச் செல்லவும்",
    customerLoginNote: "இந்த சாதனத்தில் சேமிக்கப்படும்; மீண்டும் கேட்கப்பட மாட்டாது.",
    customerLoginStaff: "பணியாளரா?",
    fieldRequired: "இந்தப் புலம் அவசியம்.",
    mobileInvalid: "சரியான 10 இலக்க மொபைல் எண்ணை உள்ளிடவும்.",
    welcomeUser: "வரவேற்கிறோம் {name}",
    orderSuccessTitle: "உங்கள் ஆர்டர் வெற்றிகரமாகப் பதிவு செய்யப்பட்டது!",
    orderSuccessThanks: "நன்றி, {name}.",
    orderSuccessBody:
      "இருப்பைச் சரிபார்த்த பிறகு உங்கள் ஆர்டர் அனுப்பி வைக்கப்படும். உங்கள் ஆதரவுக்கு மனமார்ந்த நன்றி.",
    orderSuccessRef: "ஆர்டர் எண்: #{ref}",
    amountLabel: "தொகை",
    roundOffLabel: "ரவுண்ட் ஆஃப்",

    // sales rep
    salesRepLink: "விற்பனை பிரதிநிதி",
    salesRepLoginTitle: "விற்பனை பிரதிநிதி உள்நுழைவு",
    salesRepLoginSubtitle: "உங்கள் பெயரில் ஆர்டர்களை செய்ய உள்நுழையவும்.",
    salesRepDashboardTitle: "விற்பனை பிரதிநிதி பலகை",
    salesRepWelcome: "வரவேற்கிறோம், {name}.",
    salesRepDashboardNote:
      "நீங்கள் உள்நுழைந்துள்ளீர்கள் — இங்கிருந்து செய்யும் எந்த வாட்ஸ்அப் ஆர்டரிலும் உங்கள் பெயர் சேர்க்கப்படும்.",
    salesRepBrowseSite: "பட்டியலை உலாவு",
    selectFolder: "நிர்வகிக்க ஒரு கோப்புறையைத் தேர்ந்தெடுக்கவும்",
    addPhoto: "புகைப்படங்கள் சேர்",
    uploadPhoto: "புகைப்படங்களை பதிவேற்றவும்",
    uploadPhotoHint: "ஒரே நேரத்தில் பல படங்களைத் தேர்ந்தெடுக்கலாம்.",
    uploadingPhotos: "பதிவேற்றுகிறது…",
    save: "சேமி",
    cancel: "ரத்துசெய்",
    backupBtn: "பேக்அப்",
    edit: "திருத்து",
    editPrice: "விலையை திருத்து",
    savePrice: "விலையை சேமி",
    unitPriceLabel: "அலகு விலை",
    unitPricePlaceholder: "ஒரு pc-க்கான விலை (₹)",
    clearPrice: "இயல்பு விலையை பயன்படுத்து",
    confirmDelete:
      "இந்த புகைப்படத்தை பேக்அப்பிற்கு நகர்த்தவா? எப்போது வேண்டுமானாலும் மீட்டெடுக்கலாம்.",
    photosInFolder: "இந்த கோப்புறையில் உள்ள புகைப்படங்கள்",
    noPhotosAdmin: "இன்னும் புகைப்படங்கள் இல்லை. கீழே ஒன்றைச் சேர்க்கவும்.",
    changesSavedNote:
      "மாற்றங்கள் இந்த உலாவியில் மட்டுமே சேமிக்கப்படுகின்றன (சர்வர் இணைக்கப்படவில்லை).",

    // backup / restore (admin only)
    backupFoldersLabel: "பேக்அப் (நிர்வாகி மட்டும்)",
    searchInFolderPlaceholder: "இந்த கோப்புறையில் புகைப்படங்களைத் தேடு…",
    clearSearch: "தேடலை அழி",
    searchNoResults: "\"{query}\" உடன் பொருந்தும் புகைப்படங்கள் இல்லை.",
    backupFolderNote:
      "பொருந்தும் கோப்புறையிலிருந்து நீக்கப்பட்ட புகைப்படங்கள் இங்கே வரும். அவற்றை மீட்டெடுக்கவும் அல்லது நிரந்தரமாக நீக்கவும்.",
    noPhotosBackup: "இப்போது இங்கே நீக்கப்பட்ட புகைப்படங்கள் இல்லை.",
    restorePhoto: "மீட்டெடு",
    deletePermanently: "நிரந்தரமாக நீக்கு",
    confirmPermanentDelete:
      "இந்த புகைப்படத்தை நிரந்தரமாக நீக்கவா? இதை மீட்க முடியாது.",
    selectMultiple: "பலவற்றைத் தேர்ந்தெடு",
    cancelSelectMultiple: "ரத்துசெய்",
    selectAllBtn: "அனைத்தையும் தேர்ந்தெடு",
    bulkSelectedCount_one: "{n} தேர்ந்தெடுக்கப்பட்டது",
    bulkSelectedCount_other: "{n} தேர்ந்தெடுக்கப்பட்டன",
    deleteSelectedBtn: "தேர்ந்தெடுத்தவற்றை நீக்கு",
    backupDeletedBtn: "நீக்கியவற்றை பேக்அப் செய்",
    confirmBulkDelete_one:
      "தேர்ந்தெடுக்கப்பட்ட {n} புகைப்படத்தை நிரந்தரமாக நீக்கவா? இதை மீட்க முடியாது.",
    confirmBulkDelete_other:
      "தேர்ந்தெடுக்கப்பட்ட {n} புகைப்படங்களை நிரந்தரமாக நீக்கவா? இதை மீட்க முடியாது.",
    confirmBulkDeleteNormal_one:
      "தேர்ந்தெடுக்கப்பட்ட {n} புகைப்படத்தை பேக்அப்பிற்கு நகர்த்தவா? எப்போது வேண்டுமானாலும் மீட்டெடுக்கலாம்.",
    confirmBulkDeleteNormal_other:
      "தேர்ந்தெடுக்கப்பட்ட {n} புகைப்படங்களை பேக்அப்பிற்கு நகர்த்தவா? எப்போது வேண்டுமானாலும் மீட்டெடுக்கலாம்.",

    // language switch
    language: "மொழி",

    // cart
    addToCart: "கார்ட்டில் சேர்",
    addMoreToCart: "மேலும் சேர்",
    addedToCart: "சேர்க்கப்பட்டது ✓",
    inCartBtn: "✓ கார்ட்டில் உள்ளது",
    inCartQtyGrPcLabel: "கார்ட்டில்: {qty} GR(s) அல்லது {pcs} PC(s)",
    inCartQtyGrLabel: "கார்ட்டில்: {qty} GR(s)",
    cartLineGr: "{qty} GR(s)",
    cartLineGrPc: "{qty} GR(s) அல்லது {pcs} PC(s)",
    qtyLabel: "அளவு (பேக்)",
    decreaseQty: "அளவைக் குறை",
    increaseQty: "அளவை அதிகரி",
    checkoutCart: "கார்ட் பார்வையிட",
    yourCart: "உங்கள் கார்ட்",
    closeCart: "கார்ட்டை மூடு",
    emptyCart: "உங்கள் கார்ட் காலியாக உள்ளது. சில பெட்டிகளைச் சேர்க்கவும்.",
    removeItem: "அகற்று",
    cartItemCount_one: "{n} பொருள்",
    cartItemCount_other: "{n} பொருட்கள்",
    totalQtyLabel: "மொத்த அளவு",
    clearCart: "கார்ட்டை காலி செய்",
    placeOrderWhatsApp: "வாட்ஸ்அப் மூலம் ஆர்டர் செய்",
    rateLabel: "விலை",
    subtotalLabel: "கூட்டுத்தொகை",
    totalValueLabel: "மொத்த மதிப்பு",
    inStockLabel: "கையிருப்பில் உள்ளது",
    stockLimitError:
      "{available} {unit} மட்டுமே கையிருப்பில் உள்ளது ({inCart} ஏற்கனவே உங்கள் கார்ட்டில் உள்ளது).",

    // admin: inventory list view
    foldersTab: "📁 கோப்புறைகள்",
    inventoryTab: "📦 கையிருப்பு",
    inventoryTitle: "கையிருப்பு",
    inventoryNote:
      "ஒவ்வொரு பொருளுக்கும் கையிருப்பில் உள்ள PC எண்ணிக்கையை அமைக்கவும். GR(s) தானாக கணக்கிடப்படும் (PC ÷ 150), வாடிக்கையாளர்கள் இதற்கு மேல் கார்ட்டில் சேர்க்க முடியாது.",
    inventoryTotalCount_one: "கையிருப்பில் {n} பொருள்",
    inventoryTotalCount_other: "கையிருப்பில் {n} பொருட்கள்",
    inventoryFilteredCount: "{total} இல் {count} பொருட்கள் காட்டப்படுகின்றன",
    photoColumnLabel: "தயாரிப்புகள்",
    folderColumnLabel: "கோப்புறை",
    viewItemOnSite: "இந்த பொருளை தளத்தில் காண்க",
    pcsColumnLabel: "PC(s)",
    currentStockColumnLabel: "தற்போதைய கையிருப்பு",
    stockAdjustColumnLabel: "STOCK(+)/(-)",
    damageColumnLabel: "சேதம்",
    addStockTooltip: "கையிருப்பில் சேர்",
    subtractStockTooltip: "கையிருப்பிலிருந்து குறை",
    markDamageTooltip: "சேதமடைந்ததாக குறி",
    grColumnLabel: "GR(s)",
    clearStockColumnLabel: "கையிருப்பை காலி செய்",
    clearStockBtn: "காலி செய்",
    noStockSet: "வரம்பு இல்லை",
    okLabel: "சரி",
    stockAddConfirmTitle: "கையிருப்பைச் சேர்க்கவா?",
    stockSubtractConfirmTitle: "கையிருப்பைக் குறைக்கவா?",
    damageConfirmTitle: "சேதத்தை பதிவு செய்யவா?",
    stockAddConfirmMessage:
      "தற்போதைய கையிருப்பு {base} pc உடன் {delta} pc சேர்க்கவா? புதிய கையிருப்பு {next} pc ஆக இருக்கும்.",
    stockSubtractConfirmMessage:
      "தற்போதைய கையிருப்பு {base} pc இலிருந்து {delta} pc குறைக்கவா? புதிய கையிருப்பு {next} pc ஆக இருக்கும்.",
    damageConfirmMessage:
      "{delta} pc சேதமடைந்ததாக குறித்து தற்போதைய கையிருப்பு {base} pc இலிருந்து நீக்கவா? புதிய கையிருப்பு {next} pc ஆக இருக்கும்.",
    stockExceedsCurrentError:
      "{delta} pc குறைக்க முடியாது — தற்போதைய கையிருப்பில் {base} pc மட்டுமே உள்ளது.",
    shopNameLabel: "கடை பெயர்:",
    shopNamePlaceholder: "கடை பெயரை உள்ளிடவும்",
    locationLabel: "இடம்:",
    locationPlaceholder: "இடத்தை உள்ளிடவும்",
    mobileLabel: "மொபைல்:",
    mobilePlaceholder: "மொபைல் எண்ணை உள்ளிடவும்",
    noExtraChargeLabel: "இதர",
    extraAmountLabel: "கூடுதல் தொகை (₹)",

    // pricing settings (admin only)
    priceSaved: "விலை புதுப்பிக்கப்பட்டது ✓",

    // bulk restore (backup folders, admin only)
    restoreSelectedBtn: "தேர்ந்தெடுத்தவற்றை மீட்டெடு",
    confirmRestoreSelected_one:
      "தேர்ந்தெடுக்கப்பட்ட {n} புகைப்படத்தை அதன் அசல் கோப்புறைக்கு மீட்டெடுக்கவா?",
    confirmRestoreSelected_other:
      "தேர்ந்தெடுக்கப்பட்ட {n} புகைப்படங்களை அவற்றின் அசல் கோப்புறைகளுக்கு மீட்டெடுக்கவா?",
  },
};

const FOLDER_NAME_TA = {
  "ring-boxes": "மோதிர பெட்டிகள்",
  "kammal-boxes": "காதணி பெட்டிகள்",
  "jimiki-boxes": "ஜிமிக்கி பெட்டிகள்",
  "coin-boxes": "நாணய பெட்டிகள்",
  "chain-boxes": "சங்கிலி பெட்டிகள்",
  "bangle-boxes": "வளையல் பெட்டிகள்",
  "mini-round-boxes": "மினி வட்ட பெட்டிகள்",
  "no-5-boxes": "எண்.5 பெட்டிகள்",
  "set-boxes": "செட் பெட்டிகள்",
  "zip-calcutta": "ஜிப் & கல்கத்தா",
  "choker-boxes": "சோக்கர் பெட்டிகள்",
  "d-cut-shopper-bags": "டி-கட் & ஷாப்பர் பைகள்",
  "surukku-pouches": "சுருக்குப் பைகள்",
  "16x10-set": "16X10\" செட்",
  "backup-ring-boxes": "பேக்அப்-மோதிர பெட்டிகள்",
  "backup-kammal-boxes": "பேக்அப்-காதணி பெட்டிகள்",
  "backup-jimiki-boxes": "பேக்அப்-ஜிமிக்கி பெட்டிகள்",
  "backup-coin-boxes": "பேக்அப்-நாணய பெட்டிகள்",
  "backup-chain-boxes": "பேக்அப்-சங்கிலி பெட்டிகள்",
  "backup-bangle-boxes": "பேக்அப்-வளையல் பெட்டிகள்",
  "backup-mini-round-boxes": "பேக்அப்-மினி வட்ட பெட்டிகள்",
  "backup-no-5-boxes": "பேக்அப்-எண்.5 பெட்டிகள்",
  "backup-set-boxes": "பேக்அப்-செட் பெட்டிகள்",
  "backup-zip-calcutta": "பேக்அப்-ஜிப் & கல்கத்தா",
  "backup-choker-boxes": "பேக்அப்-சோக்கர் பெட்டிகள்",
  "backup-d-cut-shopper-bags": "பேக்அப்-டி-கட் & ஷாப்பர் பைகள்",
  "backup-surukku-pouches": "பேக்அப்-சுருக்குப் பைகள்",
  "backup-16x10-set": "பேக்அப்-16X10\" செட்",
};

// Translate a folder's display name given its slug + English fallback name.
export function translateFolderName(lang, slug, fallbackName) {
  if (lang === "ta" && FOLDER_NAME_TA[slug]) return FOLDER_NAME_TA[slug];
  return fallbackName;
}

const LanguageContext = createContext(null);
const STORAGE_KEY = "ujp_lang";

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "ta" ? "ta" : "en";
    } catch {
      return "en";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      /* ignore (e.g. storage disabled) */
    }
    document.documentElement.lang = lang;
  }, [lang]);

  function t(key, vars) {
    const dict = STRINGS[lang] || STRINGS.en;
    let str = dict[key] ?? STRINGS.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        str = str.replace(`{${k}}`, v);
      }
    }
    return str;
  }

  // Pluralization helper: t.count("photoCount", n)
  t.count = (baseKey, n) => {
    const dict = STRINGS[lang] || STRINGS.en;
    const key = n === 1 ? `${baseKey}_one` : `${baseKey}_other`;
    let str = dict[key] ?? STRINGS.en[key] ?? key;
    return str.replace("{n}", n);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside a LanguageProvider");
  }
  return ctx;
}
