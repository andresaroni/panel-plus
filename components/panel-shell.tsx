"use client";

import {
  BarChart3,
  Bot,
  Database,
  Landmark,
  LayoutGrid,
  LogOut,
  Menu,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/app/actions/auth";
import { RequestNotifications } from "@/components/request-notifications";
import panelPlusLogo from "@/assets/nuevo_logo.png";
import type { CurrentUser } from "@/lib/session";

const titles: Record<string, string> = {
  solicitudes: "Solicitudes",
  plataformas: "Base de datos de plataformas",
  bancos: "Base de datos de bancos",
  usuarios: "Usuarios y roles",
  reportes: "Reportes",
  asistente: "Asistente IA",
};

export function PanelShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const current = pathname.split("/")[1] || "solicitudes";
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const nav = [
    { href: "/solicitudes", label: "Solicitudes", icon: LayoutGrid },
    { href: "/plataformas", label: "Plataformas", icon: Database },
    { href: "/bancos", label: "Bancos", icon: Landmark },
    ...(user.role === "administrador"
      ? [
          { href: "/usuarios", label: "Usuarios y roles", icon: Users },
          { href: "/reportes", label: "Reportes", icon: BarChart3 },
          { href: "/asistente", label: "Asistente IA", icon: Bot },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen lg:pl-64">
      {open && (
        <button
          className="fixed inset-0 z-30 bg-foreground/35 lg:hidden"
          onClick={() => setOpen(false)}
          aria-label="Cerrar menú"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex min-h-24 items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0 flex-1">
            <Image src={panelPlusLogo} alt="PanelPlus+" priority className="h-auto w-full" />
            <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              PanelPlus+ · Centro de operaciones
            </p>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Cerrar menú">
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-5">
          <p className="px-3 pb-3 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/45">
            Operaciones
          </p>
          <div className="space-y-1">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-white"
                  }`}
                >
                  <Icon className="size-5" aria-hidden="true" /> {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="m-3 rounded-xl bg-sidebar-accent/60 p-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="text-xs capitalize text-sidebar-foreground/50">{user.role}</p>
            </div>
            <form action={logoutAction}>
              <button aria-label="Cerrar sesión" title="Cerrar sesión">
                <LogOut className="size-4 text-sidebar-foreground/50" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-20 items-center justify-between border-b bg-background/95 px-5 backdrop-blur md:px-8">
        <div className="flex items-center gap-3">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Menu />
          </button>
          <div>
            <p className="text-xs text-muted-foreground">Panel de control</p>
            <h1 className="text-lg font-semibold">{titles[current] ?? "Panel"}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RequestNotifications />
          <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-primary" /> Sistema operativo
          </div>
          <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            {initials}
          </span>
        </div>
      </header>

      <main className="px-5 py-8 md:px-8 lg:px-10">{children}</main>
    </div>
  );
}
