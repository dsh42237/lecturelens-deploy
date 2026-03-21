"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/live", label: "Live Session" },
  { href: "/profile", label: "Profile" },
  { href: "/semesters", label: "Semesters & Courses" },
  { href: "/sessions", label: "Session History" }
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand-wrap">
        <Image
          src="/Logo.jpeg"
          alt="LectureLens logo"
          width={40}
          height={40}
          className="sidebar-logo"
        />
        <div className="sidebar-brand">LectureLens</div>
      </div>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${active ? "active" : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">V1.0.1</div>
    </aside>
  );
}
