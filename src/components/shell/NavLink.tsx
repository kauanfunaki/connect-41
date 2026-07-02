"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItemProps = {
  href: string;
  icon: string;
  label: string;
};

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavItem({ href, icon, label }: NavItemProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
        active
          ? "bg-brand/[0.08] text-brand"
          : "text-fg-secondary hover:bg-surface-2 hover:text-fg"
      }`}
    >
      <span className="text-[14px] leading-none">{icon}</span>
      {label}
    </Link>
  );
}

type SectorNavItemProps = {
  href: string;
  label: string;
  color: string;
};

export function SectorNavItem({ href, label, color }: SectorNavItemProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[11px] transition-colors ${
        active ? "bg-brand/[0.08] text-brand font-medium" : "text-fg-secondary hover:bg-surface-2 hover:text-fg"
      }`}
    >
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </Link>
  );
}
