import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except for Next.js internals and static files
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
