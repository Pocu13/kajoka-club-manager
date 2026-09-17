import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Calendar,
  ChevronDown,
  Clock,
  CreditCard,
  LayoutGrid,
  LogOut,
  Package,
  Receipt,
  Search,
  Settings,
  ShoppingBag,
  Tag,
  Users,
  BarChart3,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { auth, stockState, useCurrentUser, useDB } from "@/lib/store";
import { fmtDateLong, initials } from "@/lib/format";
import { Badge } from "./ui-kit";

const NAV = [
  { to: "/home", label: "Home", icon: LayoutGrid },
  { to: "/pos", label: "POS", icon: CreditCard },
  { to: "/prodotti", label: "Prodotti", icon: Tag },
  { to: "/magazzino", label: "Magazzino", icon: Package },
  { to: "/movimenti", label: "Movimenti", icon: ArrowLeftRight },
  { to: "/storico", label: "Storico", icon: Clock },
  { to: "/statistiche", label: "Statistiche", icon: BarChart3 },
  { to: "/utenti", label: "Utenti", icon: Users },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings },
] as const;

const ADMIN_ONLY = new Set(["/utenti", "/impostazioni", "/statistiche"]);

function Clockface() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-container px-3 py-2">
      <Calendar className="size-4 text-primary" />
      <span className="mono text-xs text-muted-foreground">{fmtDateLong(now)}</span>
      <span className="mono text-xs font-bold">
        {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
      </span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const db = useDB();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready && !db.currentUserId) navigate({ to: "/login", replace: true });
  }, [ready, db.currentUserId, navigate]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="mono animate-pulse text-sm text-muted-foreground">
          KAJOKA — caricamento…
        </div>
      </div>
    );
  }

  const isAdmin = user.role === "admin";
  const lowStock = db.products.filter((p) => stockState(p) !== "ok").length;
  const nav = NAV.filter((n) => isAdmin || !ADMIN_ONLY.has(n.to));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-border bg-surface lg:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-xl font-black text-primary glow-primary">
            K
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">KAJOKA</span>
        </div>

        <nav className="flex-1 space-y-1 px-4">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "label-caps flex items-center gap-3 rounded-xl px-4 py-3 transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_8px_30px_-14px_rgba(255,77,0,1)]"
                    : "text-muted-foreground hover:bg-surface-high hover:text-foreground",
                )}
              >
                <Icon className="size-[18px]" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-border p-4">
          {lowStock > 0 && (
            <Link to="/magazzino" className="block">
              <Badge tone="warning" className="w-full justify-center py-1.5">
                {lowStock} prodotti sottoscorta
              </Badge>
            </Link>
          )}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-container p-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/20 text-sm font-bold text-primary">
              {initials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="label-caps text-muted-foreground">
                {isAdmin ? "Amministratore" : "Dipendente"}
              </div>
            </div>
            <button
              onClick={() => {
                auth.logout();
                navigate({ to: "/login", replace: true });
              }}
              title="Esci"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-high hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-[248px]">
        <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-surface/90 px-3 py-3 backdrop-blur sm:px-5 lg:flex lg:gap-4 lg:px-6">
          <Link to="/home" className="flex min-w-0 items-center gap-2 lg:hidden">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-bold text-primary">K</span>
            <span className="truncate font-display text-xl font-bold">KAJOKA</span>
          </Link>
          <div className="relative hidden max-w-md flex-1 lg:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Cerca operazioni, campi, atleti…"
              className="h-10 w-full rounded-lg border border-border bg-surface-container pr-3 pl-9 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 lg:ml-auto lg:gap-3">
            <div className="hidden lg:block"><Clockface /></div>
            <button className="relative rounded-lg border border-border bg-surface-container p-2.5 text-muted-foreground hover:text-foreground">
              <Bell className="size-4" />
              {lowStock > 0 && (
                <span className="mono absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                  {lowStock}
                </span>
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface-container px-3 py-2"
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                  {initials(user.name)}
                </span>
                <span className="hidden text-sm font-medium sm:inline">
                  {isAdmin ? "Admin" : "Dipendente"}
                </span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-border bg-surface-container p-2 shadow-2xl">
                  <div className="px-3 py-2">
                    <div className="text-sm font-semibold">{user.name}</div>
                    <div className="mono text-xs text-muted-foreground">
                      @{user.username}
                    </div>
                  </div>
                   {isAdmin && (
                     <Link
                       to="/impostazioni"
                       onClick={() => setMenuOpen(false)}
                       className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-surface-high hover:text-foreground"
                     >
                       <Settings className="size-4" /> Impostazioni
                     </Link>
                   )}
                  <button
                    onClick={() => {
                      auth.logout();
                      navigate({ to: "/login", replace: true });
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger hover:bg-surface-high"
                  >
                    <LogOut className="size-4" /> Esci
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-3 py-4 pb-28 sm:px-5 lg:px-6 lg:py-6 lg:pb-6">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-1 overflow-x-auto border-t border-border bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden">
        {nav.map((item) => {
          const active = pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={cn(
                "flex min-w-[68px] flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] font-semibold",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export { ShoppingBag, Receipt };
