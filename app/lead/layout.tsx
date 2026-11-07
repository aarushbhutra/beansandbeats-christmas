"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/shell";

const TABS = [
  { href: "/lead", label: "today" },
  { href: "/lead/menu", label: "menu" },
  { href: "/lead/reports", label: "sales" },
  { href: "/lead/devices", label: "tablets" },
  { href: "/lead/team", label: "team" },
];

export default function LeadLayout({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <StaffShell area="lead" leadOnly>
      <nav className="-mx-4 -mt-6 mb-6 flex gap-6 overflow-x-auto border-b border-line px-4 sm:-mx-6 sm:px-6" aria-label="Booth lead">
        {TABS.map(tab => {
          const active = tab.href === "/lead" ? path === "/lead" : path.startsWith(tab.href);
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
              className="nav-link shrink-0">
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </StaffShell>
  );
}
