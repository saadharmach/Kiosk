export const LOCALES = ["fr", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const dirOf = (l: Locale): "ltr" | "rtl" => (l === "ar" ? "rtl" : "ltr");
export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

/** Morocco uses Western digits; -u-nu-latn keeps them that way in Arabic. */
export const bcp47: Record<Locale, string> = {
  fr: "fr-MA",
  en: "en-MA",
  ar: "ar-MA-u-nu-latn",
};

export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

export function money(amount: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(bcp47[locale], { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

type Dict = {
  welcome: string; tapToStart: string; loading: string;
  errorTitle: string; retry: string; menuUnavailable: string;
  orderTypeTitle: string; eatIn: string; takeAway: string; delivery: string;
  tableTitle: string; tableHint: string; tableInvalid: string;
  back: string; confirm: string; clear: string; close: string;
  table: string; chooseSize: string; add: string; viewOrder: string;
  empty: string; quantity: string;
  yourOrder: string; remove: string; confirmOrder: string; sending: string;
  orderNumber: string; payAtCashier: string; priceChanged: string;
  newOrder: string; thanks: string,other: string,standNumber: string;
};

export const STRINGS: Record<Locale, Dict> = {
  fr: {
    welcome: "Bienvenue", tapToStart: "Touchez l'écran pour commander", loading: "Chargement…",
    errorTitle: "Service indisponible", retry: "Réessayer",
    menuUnavailable: "Le menu n'est pas encore disponible",
    orderTypeTitle: "Comment souhaitez-vous commander ?",
    eatIn: "Sur place", takeAway: "À emporter", delivery: "Livraison",
    tableTitle: "Numéro de table", tableHint: "Saisissez le numéro inscrit sur votre table",
    tableInvalid: "Ce numéro de table n'existe pas",
    back: "Retour", confirm: "Confirmer", clear: "Effacer", close: "Fermer",
    table: "Table", chooseSize: "Choisissez une taille", add: "Ajouter",
    viewOrder: "Voir ma commande", empty: "Votre commande est vide", quantity: "Quantité",    yourOrder: "Votre commande", remove: "Retirer", confirmOrder: "Confirmer la commande",
    sending: "Envoi en cours…", orderNumber: "Votre numéro", 
    payAtCashier: "Présentez ce numéro en caisse pour payer",
    priceChanged: "Les prix ont changé. Veuillez vérifier votre commande.",
    newOrder: "Nouvelle commande", thanks: "Merci !",other: "Autres",
     standNumber: "Posez ce numéro sur votre table",
  },
  en: {
    welcome: "Welcome", tapToStart: "Touch the screen to order", loading: "Loading…",
    errorTitle: "Service unavailable", retry: "Try again",
    menuUnavailable: "The menu is not available yet",
    orderTypeTitle: "How would you like to order?",
    eatIn: "Eat in", takeAway: "Take away", delivery: "Delivery",
    tableTitle: "Table number", tableHint: "Enter the number shown on your table",
    tableInvalid: "That table number does not exist",
    back: "Back", confirm: "Confirm", clear: "Clear", close: "Close",
    table: "Table", chooseSize: "Choose a size", add: "Add",
    viewOrder: "View my order", empty: "Your order is empty", quantity: "Quantity",    yourOrder: "Your order", remove: "Remove", confirmOrder: "Confirm order",
    sending: "Sending…", orderNumber: "Your number",
    payAtCashier: "Show this number at the cashier to pay",
    priceChanged: "Prices have changed. Please check your order.",
    newOrder: "New order", thanks: "Thank you!",other: "Other", standNumber: "Place this number on your table",
  },   
  ar: {
    welcome: "أهلاً وسهلاً", tapToStart: "المس الشاشة للطلب", loading: "جارٍ التحميل…",
    errorTitle: "الخدمة غير متاحة", retry: "إعادة المحاولة",
    menuUnavailable: "قائمة الطعام غير متاحة بعد",
    orderTypeTitle: "كيف تود أن تطلب؟",
    eatIn: "تناول في المطعم", takeAway: "طلب خارجي", delivery: "توصيل",
    tableTitle: "رقم الطاولة", tableHint: "أدخل الرقم الموجود على طاولتك",
    tableInvalid: "رقم الطاولة غير موجود",
    back: "رجوع", confirm: "تأكيد", clear: "مسح", close: "إغلاق",
    table: "طاولة", chooseSize: "اختر الحجم", add: "إضافة",
    viewOrder: "عرض طلبي", empty: "طلبك فارغ", quantity: "الكمية",    yourOrder: "طلبك", remove: "إزالة", confirmOrder: "تأكيد الطلب",
    sending: "جارٍ الإرسال…", orderNumber: "رقمك",
    payAtCashier: "أظهر هذا الرقم عند الصندوق للدفع",
    priceChanged: "تغيرت الأسعار. يرجى مراجعة طلبك.",
    newOrder: "طلب جديد", thanks: "شكراً لك!",other: "أخرى",    standNumber: "ضع هذا الرقم على طاولتك",
  },
};

export const ORDER_TYPE_LABEL = (t: string, d: Dict) =>
  t === "EAT_IN" ? d.eatIn : t === "TAKE_AWAY" ? d.takeAway : d.delivery;