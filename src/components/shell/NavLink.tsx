"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItemProps = {
  href: string;
  icon: React.ReactNode;
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
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[14px] font-medium transition-colors ${
        active
          ? "bg-brand-subtle text-fg"
          : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
      }`}
    >
      <span className={`flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${active ? "text-brand-hover" : ""}`}>{icon}</span>
      {label}
    </Link>
  );
}

type SectorNavItemProps = {
  href: string;
  label: string;
  color: string;
  icon?: React.ReactNode;
};

export function SectorNavItem({ href, label, color, icon }: SectorNavItemProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
        active ? "bg-brand-subtle text-fg font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
      }`}
    >
      <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: color }} />
      {icon && <span className="flex-shrink-0 [&>svg]:w-[15px] [&>svg]:h-[15px]">{icon}</span>}
      {label}
    </Link>
  );
}
