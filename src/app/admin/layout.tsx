import type React from "react";
import { AdminHeader } from "@/components/admin-header";
import { AdminSidebar } from "@/components/admin-sidebar";
import { SidebarProvider } from "@/components/sidebar-provider";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="relative min-h-screen bg-background">
        <AdminSidebar />
        <div className="lg:pl-64">
          <AdminHeader />
          <main className="p-4 md:p-6 lg:p-8 fade-in-up">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
