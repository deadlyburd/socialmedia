import type React from "react";
import { ClientHeader } from "@/components/client-header";
import { ClientSidebar } from "@/components/client-sidebar";
import { SidebarProvider } from "@/components/sidebar-provider";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="relative min-h-screen bg-background">
        <ClientSidebar />
        <div className="lg:pl-64">
          <ClientHeader />
          <main className="p-4 md:p-6 lg:p-8 fade-in-up">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
