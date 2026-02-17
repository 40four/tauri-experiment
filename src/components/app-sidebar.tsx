"use client"

import * as React from "react"

import { NavLinks } from "@/components/nav-links"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// ---------------------------------------------------------------------------
// AppSidebar
// Top-level sidebar shell. Composes the logo header, nav links, and user footer.
// ---------------------------------------------------------------------------

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar variant="inset" {...props}>
      {/* ------------------------------------------------------------------ */}
      {/* Header — Dashlens logo + wordmark                                  */}
      {/* ------------------------------------------------------------------ */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                {/* Logo image — sized to match the sidebar button icon area */}
                <img
                  src="/dashlens-logo.svg"
                  alt="Dashlens logo"
                  className="size-8 shrink-0"
                />
                {/* Wordmark */}
                <span className="text-base font-semibold tracking-tight">
                  Dashlens
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* ------------------------------------------------------------------ */}
      {/* Content — primary navigation links                                 */}
      {/* ------------------------------------------------------------------ */}
      <SidebarContent>
        <NavLinks />
      </SidebarContent>

      {/* ------------------------------------------------------------------ */}
      {/* Footer — user identity + logout via AuthContext                    */}
      {/* ------------------------------------------------------------------ */}
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
