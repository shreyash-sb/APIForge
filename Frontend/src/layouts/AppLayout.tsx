import { Outlet } from "react-router-dom";

import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1680px]">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col min-w-0">
          <Header />
          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
