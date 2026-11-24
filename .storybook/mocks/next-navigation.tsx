// Storybook runs on `@storybook/react-vite`, not `@storybook/nextjs`, so
// there's no App Router context provider mounting `next/navigation`'s real
// hooks — any story that renders a component calling `useRouter()` (e.g.
// PlayerCard) throws "invariant expected app router to be mounted" and
// crashes to Storybook's error overlay instead of rendering. `.storybook/main.ts`
// aliases `next/navigation` to this stub so those hooks resolve to no-op
// values instead.
export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  };
}

export function usePathname() {
  return '/';
}

export function useSearchParams() {
  return new URLSearchParams();
}

export function useParams() {
  return {};
}

export function redirect() {}
export function permanentRedirect() {}
export function notFound() {}
