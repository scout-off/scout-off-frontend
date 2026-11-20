import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import sw from "../messages/sw.json";

const messages: Record<(typeof routing.locales)[number], object> = {
  en,
  fr,
  sw,
};

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && (routing.locales as readonly string[]).includes(requested)
      ? (requested as (typeof routing.locales)[number])
      : routing.defaultLocale;

  return {
    locale,
    messages: messages[locale],
  };
});
