import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware navigation primitives. `Link` automatically keeps the current
// locale in the URL, so internal links resolve to e.g. `/fr/scout` instead of
// `/scout` (which would otherwise hit the middleware redirect).
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
