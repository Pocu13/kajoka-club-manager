import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useDB } from "@/lib/store";

export const Route = createFileRoute("/")({
  ssr: false,
  component: IndexRedirect,
});

function IndexRedirect() {
  const db = useDB();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: db.currentUserId ? "/home" : "/login", replace: true });
  }, [db.currentUserId, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <span className="mono animate-pulse text-sm text-muted-foreground">KAJOKA</span>
    </div>
  );
}
