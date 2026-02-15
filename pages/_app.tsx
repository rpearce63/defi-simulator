import { AppProps } from "next/app";
import Head from "next/head";
import {
  MantineProvider,
  ColorScheme,
  MantineThemeOverride,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { t } from "@lingui/macro";

// Styles specific to noUI slider
import "nouislider/dist/nouislider.css";
import "../css/slider.css";

const defaultLocale = "en";
const { messages } = await import(`../src/locales/${defaultLocale}/messages`);
import languages from "../src/languages/index.json";

i18n.load(defaultLocale, messages);
i18n.activate(defaultLocale);

/*
import langItems from "../src/languages/index.json";
const langs = langItems.map(item => item.code)
console.log({ langs })
*/

/**
 * Load and activate a locale. Messages are loaded from the app bundle via dynamic
 * import (../src/locales/{locale}/messages), not from the site URL. Next.js bundles
 * each locale’s messages at build time; the defisim.xyz links in Head are only
 * alternate hreflang links for SEO. If the locale has no compiled messages (e.g.
 * only en exists locally), we fall back to English.
 */
export async function activateLocale(locale: string) {
  try {
    const { messages } = await import(`../src/locales/${locale}/messages`);
    i18n.load(locale, messages);
    i18n.activate(locale);
  } catch {
    const { messages } = await import(`../src/locales/${defaultLocale}/messages`);
    i18n.load(defaultLocale, messages);
    i18n.activate(defaultLocale);
  }
}

export default function App(props: AppProps & { colorScheme: ColorScheme }) {
  const { Component, pageProps } = props;

  return (
    <>
      <Head>
        <title>DeFi Simulator</title>
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width"
        />
        <meta
          name="description"
          content={t`DeFi Simulator is an unofficial, open source, community-built Aave debt simulator and liquidation calculator.`}
        />
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token": "42f927fda7404332a3720866ad63795f"}'
        />
        <link rel="shortcut icon" href="/favicon.ico" />
        {/* Alternate language URLs for SEO only; messages are loaded from the bundle (see activateLocale). */}
        {languages.map((language) => (
          <link
            key={language.code}
            rel="alternate"
            hrefLang={language.code}
            href={`https://defisim.xyz/${language.code}`}
          />
        ))}
      </Head>
      <I18nProvider i18n={i18n}>
        <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
          <Component {...pageProps} />
          <Notifications />
        </MantineProvider>
      </I18nProvider>
    </>
  );
}

const theme: MantineThemeOverride = {
  colorScheme: "dark",
  breakpoints: {
    xs: "0",
    sm: "576",
    md: "768",
    lg: "992",
    xl: "1200",
  },
};
