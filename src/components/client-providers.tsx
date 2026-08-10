"use client";

import { AuthProvider } from "@/lib/auth-context";
import { SidebarProvider } from "@/components/sidebar-provider";
import type { ReactNode } from "react";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <SidebarProvider>{children}</SidebarProvider>
    </AuthProvider>
  );
}
