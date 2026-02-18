"use client"

import { MoreHorizontal, PenLine, Database, BarChart2, type LucideIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ROUTES } from "@/router"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NavLinkAction {
  label: string
  onClick?: () => void
}

interface NavLinkItem {
  name: string
  url: string
  icon: LucideIcon
  /** Optional actions shown in the 3-dot dropdown */
  actions?: NavLinkAction[]
}

// ---------------------------------------------------------------------------
// Static nav data — extend actions as features are built out
// ---------------------------------------------------------------------------

const navLinks: NavLinkItem[] = [
  {
    name: "New Entry",
    url: ROUTES.NEW_ENTRY,
    icon: PenLine,
  },
  {
    name: "Data",
    url: ROUTES.DATA,
    icon: Database,
  },
  {
    name: "Analytics",
    url: ROUTES.ANALYTICS,
    icon: BarChart2,
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavLinks() {
  const { isMobile } = useSidebar()
  // Hash router paths come back as e.g. "/" from useLocation().pathname
  const { pathname } = useLocation()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {navLinks.map((item) => {
          const isActive = pathname === item.url

          return (
            <SidebarMenuItem key={item.name}>
              {/* Primary link — uses router Link for SPA navigation */}
              <SidebarMenuButton asChild isActive={isActive}>
                <Link to={item.url}>
                  <item.icon />
                  <span>{item.name}</span>
                </Link>
              </SidebarMenuButton>

              {/* 3-dot actions dropdown — only rendered if actions exist */}
              {item.actions?.length ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover>
                      <MoreHorizontal />
                      <span className="sr-only">More</span>
                    </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-40"
                    side={isMobile ? "bottom" : "right"}
                    align={isMobile ? "end" : "start"}
                  >
                    {item.actions.map((action) => (
                      <DropdownMenuItem key={action.label} onClick={action.onClick}>
                        <span>{action.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
