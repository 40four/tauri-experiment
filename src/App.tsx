import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import { Home } from "@/pages/Home";
import { NewEntry } from "@/pages/NewEntry";
import { Data } from "@/pages/Data";
import { Analytics } from "@/pages/Analytics";
import { ROUTES } from "@/router";
import "./App.css";

// ---------------------------------------------------------------------------
// Route → breadcrumb label map
// Extend this as new pages are added.
// ---------------------------------------------------------------------------
const BREADCRUMB_LABELS: Record<string, string> = {
  [ROUTES.HOME]: "Home",
  [ROUTES.NEW_ENTRY]: "New Entry",
  [ROUTES.DATA]: "Data",
  [ROUTES.ANALYTICS]: "Analytics",
};

// ---------------------------------------------------------------------------
// AppShell
// Renders the persistent sidebar + header frame. Page content is swapped via
// React Router. Must be rendered *inside* HashRouter so useLocation works.
// ---------------------------------------------------------------------------

function AppShell() {
  const { pathname } = useLocation();
  const pageLabel = BREADCRUMB_LABELS[pathname] ?? "Dashboard";

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Persistent header with dynamic breadcrumb */}
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        {/* Page content — routed */}
        <Routes>
          <Route path={ROUTES.HOME} element={<Home />} />
          <Route path={ROUTES.NEW_ENTRY} element={<NewEntry />} />
          <Route path={ROUTES.DATA} element={<Data />} />
          <Route path={ROUTES.ANALYTICS} element={<Analytics />} />
        </Routes>
      </SidebarInset>
    </SidebarProvider>
  );
}

// ---------------------------------------------------------------------------
// MainApp
// Wraps AppShell in HashRouter. HashRouter lives here (not in router.tsx) so
// the router context wraps both the sidebar and the page content together.
// ---------------------------------------------------------------------------

function MainApp() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}

// ---------------------------------------------------------------------------
// App
// Root — AuthProvider wraps everything; ProtectedRoute gates the main app.
// ---------------------------------------------------------------------------

function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <MainApp />
      </ProtectedRoute>
    </AuthProvider>
  );
}

export default App;
