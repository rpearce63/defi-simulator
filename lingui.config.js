/** @type {import('@lingui/conf').LinguiConfig} */
/**
 * Lingui workflow:
 * 1. extract - Scans components/pages for Trans/t and writes src/locales/{locale}/messages.po.
 *    Source strings (e.g. en) are filled; other locales get same keys with empty msgstr until translated.
 * 2. Translate - Fill msgstr in .po files (e.g. via TranslationIO, or manually).
 * 3. compile - Compiles .po -> messages.js for the app. Compile does NOT generate translations;
 *    it only compiles whatever is already in the .po files. Run "npm run extract" before "npm run compile".
 */
const locales = [
  "be",
  "bg",
  "bn",
  "bs",
  "ca",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "fi",
  "fil",
  "fr",
  "ga",
  "hi",
  "hr",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jv",
  "ka",
  "kk",
  "km",
  "ko",
  "ks",
  "ky",
  "lb",
  "lt",
  "lv",
  "mk",
  "ml",
  "mn",
  "ms",
  "mt",
  "my",
  "ne",
  "nl",
  "no",
  "pa",
  "pl",
  "pt",
  "ro",
  "ru",
  "sc",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "ta",
  "th",
  "tk",
  "tr",
  "uk",
  "uz",
  "vi",
  "zh-Hans"
];

module.exports = {
   locales: locales,
   catalogs: [{
      path: "src/locales/{locale}/messages",
      include: ["./components", "./pages"]
   }],
   format: "po",
   service: {
    name: "TranslationIO",
    apiKey: "7945437f43044617aa3eadaf0cb7e184"
  }
}