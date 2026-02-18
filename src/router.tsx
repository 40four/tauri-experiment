// ---------------------------------------------------------------------------
// Router
// Centralized route configuration. Using HashRouter because Tauri serves
// assets via a custom protocol (tauri://localhost) with no real HTTP server —
// hash-based routing avoids 404s on hard refresh and works across all platforms.
// ---------------------------------------------------------------------------

import { HashRouter, Routes, Route } from "react-router-dom";
import { Home } from "@/pages/Home";
import { NewEntry } from "@/pages/NewEntry";

export const ROUTES = {
  HOME: "/",
  NEW_ENTRY: "/new-entry",
  DATA: "/data",
  ANALYTICS: "/analytics",
} as const;

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route path={ROUTES.HOME} element={<Home />} />
        <Route path={ROUTES.NEW_ENTRY} element={<NewEntry />} />
        {/* Placeholder routes — implement as pages are built out */}
        <Route path={ROUTES.DATA} element={<Home />} />
        <Route path={ROUTES.ANALYTICS} element={<Home />} />
      </Routes>
    </HashRouter>
  );
}
