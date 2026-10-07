export const LOCALES = ["fr", "en", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

/** A { fr, en, ar } value in the customer's language, falling back to any language that has text. */
export function localized(map: Partial<Record<Locale, string>> | undefined, locale: Locale): string | null {
  if (!map) return null;
  for (const l of [locale, ...LOCALES.filter((x) => x !== locale)]) {
    const v = map[l];
    if (v && v.trim()) return v;
  }
  return null;
}

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
  empty: string; quantity: string; allergens: string;
  required: string; optional: string; chooseCount: string;
  yourOrder: string; remove: string; confirmOrder: string; sending: string;
  orderNumber: string; payAtCashier: string; priceChanged: string;
  newOrder: string; thanks: string,other: string,standNumber: string;
  eatInSub: string; takeAwaySub: string; deliverySub: string; helpNotice: string;
  itemsCount: string; addMore: string; seeMenu: string; resetNote: string; total: string;
  connectionTitle: string; connectionText: string; connectionInline: string; startOver: string;
  idleTitle: string; idleText: string; keepOrdering: string; discard: string;
  kindMustHave: string; kindFreeOption: string; kindSupplement: string; kindCondiment: string; kindMenuComponent: string;
  chosenCount: string; edit: string; saveChanges: string;
  suggestTitle: string; noThanks: string; added: string; done: string;
  unavailableTitle: string; unavailableText: string;
  startOrder: string; startHint: string; discover: string; fromPrice: string; needHelp: string;
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
    table: "Table", chooseSize: "Choisissez une taille", allergens: "Allergènes",
    required: "Obligatoire", optional: "Facultatif", chooseCount: "Choisissez {n}", add: "Ajouter",
    viewOrder: "Voir ma commande", empty: "Votre commande est vide", quantity: "Quantité",    yourOrder: "Votre commande", remove: "Retirer", confirmOrder: "Confirmer la commande",
    sending: "Envoi en cours…", orderNumber: "Votre numéro", 
    payAtCashier: "Présentez ce numéro en caisse pour payer",
    priceChanged: "Les prix ont changé. Veuillez vérifier votre commande.",
    newOrder: "Nouvelle commande", thanks: "Merci !",other: "Autres",
     standNumber: "Posez ce numéro sur votre table",
    eatInSub: "Nous vous l’apportons à table", takeAwaySub: "Préparé pour partir", deliverySub: "Livré à votre adresse",
    helpNotice: "Besoin d’aide ? Demandez à un membre de notre équipe.",
    itemsCount: "{n} articles", addMore: "Ajouter des articles", seeMenu: "Voir le menu",
    resetNote: "Cet écran se réinitialise dans {s} secondes", total: "Total",
    connectionTitle: "Connexion perdue", startOver: "Recommencer",
    connectionText: "Impossible de joindre le restaurant pour le moment. Votre commande est conservée, réessayez.",
    connectionInline: "Connexion perdue. Votre commande est conservée : touchez à nouveau pour réessayer.",
    idleTitle: "Êtes-vous toujours là ?", keepOrdering: "Continuer ma commande", discard: "Abandonner et recommencer",
    idleText: "Votre session va se terminer. Touchez ci-dessous pour garder votre commande.",
    kindMustHave: "Option obligatoire", kindFreeOption: "Option gratuite", kindSupplement: "Supplément", kindCondiment: "Condiment",
    kindMenuComponent: "Composant du menu", chosenCount: "{n} sélectionné(s)", edit: "Modifier", saveChanges: "Enregistrer",
    suggestTitle: "Souhaitez-vous ajouter… ?", noThanks: "Non merci", added: "Ajouté", done: "Terminé",
    unavailableTitle: "Momentanément indisponible",
    unavailableText: "Nous ne pouvons pas prendre de commande sur cette borne pour le moment. Merci de vous adresser à un membre de notre équipe.",
    startOrder: "Commencer ma commande", startHint: "Touchez le bouton et laissez-vous tenter.", discover: "À découvrir", fromPrice: "Dès", needHelp: "Besoin d’aide ?",
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
    table: "Table", chooseSize: "Choose a size", allergens: "Allergens",
    required: "Required", optional: "Optional", chooseCount: "Choose {n}", add: "Add",
    viewOrder: "View my order", empty: "Your order is empty", quantity: "Quantity",    yourOrder: "Your order", remove: "Remove", confirmOrder: "Confirm order",
    sending: "Sending…", orderNumber: "Your number",
    payAtCashier: "Show this number at the cashier to pay",
    priceChanged: "Prices have changed. Please check your order.",
    newOrder: "New order", thanks: "Thank you!",other: "Other", standNumber: "Place this number on your table",
    eatInSub: "We'll bring it to your table", takeAwaySub: "Packed to go", deliverySub: "Delivered to your address",
    helpNotice: "Need help? Ask a member of our staff.",
    itemsCount: "{n} items", addMore: "Add more items", seeMenu: "See the menu",
    resetNote: "This screen resets in {s} seconds", total: "Total",
    connectionTitle: "Connection lost", startOver: "Start over",
    connectionText: "We can't reach the restaurant right now. Your order is kept, so you can try again.",
    connectionInline: "Connection lost. Your order is kept: tap again to retry.",
    idleTitle: "Are you still there?", keepOrdering: "Continue ordering", discard: "Discard and start over",
    idleText: "Your session is about to end. Tap below to keep your order.",
    kindMustHave: "Must-have option", kindFreeOption: "Free option", kindSupplement: "Supplement", kindCondiment: "Condiment",
    kindMenuComponent: "Component selected inside a menu article", chosenCount: "{n} selected", edit: "Edit", saveChanges: "Save changes",
    suggestTitle: "Would you like to add…?", noThanks: "No thanks", added: "Added", done: "Done",
    unavailableTitle: "Temporarily unavailable",
    unavailableText: "We can't take orders on this kiosk right now. Please ask a member of our staff.",
    startOrder: "Start my order", startHint: "Tap the button and treat yourself.", discover: "Discover", fromPrice: "From", needHelp: "Need help?",
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
    table: "طاولة", chooseSize: "اختر الحجم", allergens: "مسببات الحساسية",
    required: "إلزامي", optional: "اختياري", chooseCount: "اختر {n}", add: "إضافة",
    viewOrder: "عرض طلبي", empty: "طلبك فارغ", quantity: "الكمية",    yourOrder: "طلبك", remove: "إزالة", confirmOrder: "تأكيد الطلب",
    sending: "جارٍ الإرسال…", orderNumber: "رقمك",
    payAtCashier: "أظهر هذا الرقم عند الصندوق للدفع",
    priceChanged: "تغيرت الأسعار. يرجى مراجعة طلبك.",
    newOrder: "طلب جديد", thanks: "شكراً لك!",other: "أخرى",    standNumber: "ضع هذا الرقم على طاولتك",
    eatInSub: "سنحضره إلى طاولتك", takeAwaySub: "مُعبّأ للأخذ", deliverySub: "يصلك إلى عنوانك",
    helpNotice: "تحتاج مساعدة؟ اسأل أحد موظفينا.",
    itemsCount: "{n} منتجات", addMore: "إضافة منتجات", seeMenu: "عرض القائمة",
    resetNote: "ستُعاد هذه الشاشة خلال {s} ثانية", total: "المجموع",
    connectionTitle: "انقطع الاتصال", startOver: "البدء من جديد",
    connectionText: "تعذّر الوصول إلى المطعم حاليًا. طلبك محفوظ ويمكنك المحاولة مجددًا.",
    connectionInline: "انقطع الاتصال. طلبك محفوظ: اضغط مرة أخرى للمحاولة.",
    idleTitle: "هل ما زلت هنا؟", keepOrdering: "متابعة الطلب", discard: "إلغاء والبدء من جديد",
    idleText: "ستنتهي جلستك قريبًا. اضغط أدناه للاحتفاظ بطلبك.",
    kindMustHave: "خيار إلزامي", kindFreeOption: "خيار مجاني", kindSupplement: "إضافة", kindCondiment: "مرافق",
    kindMenuComponent: "مكوّن داخل القائمة", chosenCount: "{n} مختار", edit: "تعديل", saveChanges: "حفظ التعديلات",
    suggestTitle: "هل تودّ إضافة…؟", noThanks: "لا، شكرًا", added: "تمت الإضافة", done: "تم",
    unavailableTitle: "غير متاح مؤقتًا",
    unavailableText: "لا يمكننا استلام الطلبات على هذه الشاشة حاليًا. يُرجى التوجّه إلى أحد موظفينا.",
    startOrder: "ابدأ طلبي", startHint: "المس الزر واستمتع.", discover: "اكتشف", fromPrice: "ابتداءً من", needHelp: "تحتاج مساعدة؟",
  },
};

export const ORDER_TYPE_LABEL = (t: string, d: Dict) =>
  t === "EAT_IN" ? d.eatIn : t === "TAKE_AWAY" ? d.takeAway : d.delivery;

/** unTill's name for each kind of option, in the customer's language. */
export type OptionKindName = "MUST_HAVE" | "FREE_OPTION" | "SUPPLEMENT" | "CONDIMENT" | "MENU_COMPONENT";
export const KIND_LABEL = (kind: OptionKindName, d: Dict): string =>
  kind === "MUST_HAVE" ? d.kindMustHave
  : kind === "FREE_OPTION" ? d.kindFreeOption
  : kind === "SUPPLEMENT" ? d.kindSupplement
  : kind === "CONDIMENT" ? d.kindCondiment
  : d.kindMenuComponent;
