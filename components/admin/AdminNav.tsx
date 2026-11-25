'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/** `label` is the English copy; the rendered label comes from `admin.nav.<key>`. */
export const ADMIN_SECTIONS = [
  { href: '/admin', key: 'overview', label: 'Overview' },
  { href: '/admin/validators', key: 'validators', label: 'Validators' },
  { href: '/admin/fees', key: 'fees', label: 'Fees' },
  { href: '/admin/academies', key: 'academies', label: 'Academies' },
  { href: '/admin/referrals', key: 'referrals', label: 'Referrals' },
  { href: '/admin/audit', key: 'audit', label: 'Audit Log' },
  { href: '/admin/moderation', key: 'moderation', label: 'Moderation' },
  { href: '/admin/fraud', key: 'fraud', label: 'Fraud Flags' },
  { href: '/admin/disputes', key: 'disputes', label: 'Disputes' },
  { href: '/admin/health', key: 'health', label: 'Health' },
] as const;

/** Strips an optional locale prefix (`/en/admin/fees` → `/admin/fees`). */
function toAdminPath(pathname: string): string {
  const i = pathname.indexOf('/admin');
  return i === -1 ? pathname : pathname.slice(i).replace(/\/$/, '');
}

export default function AdminNav() {
  const t = useTranslations('admin.nav');
  const current = toAdminPath(usePathname() ?? '');

  return (
    <nav aria-label={t('label')} className="md:w-48 shrink-0">
      <ul className="flex md:flex-col gap-1 overflow-x-auto">
        {ADMIN_SECTIONS.map(({ href, key }) => {
          const active = current === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? 'bg-gray-800 text-brand-green font-medium'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                }`}
              >
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
