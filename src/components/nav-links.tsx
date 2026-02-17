"use client"

import {
  MoreHorizontal,
  PenLine,
  Database,
  BarChart2,
  type LucideIcon,
} from "lucide-react"

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

// ---------------------------------------------------------------------------
// Type definitions
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
// Static nav data — update urls and actions as routes are built out
// ---------------------------------------------------------------------------

const navLinks: NavLinkItem[] = [
  {
    name: "New Entry",
    url: "#",
    icon: PenLine,
    actions: [
      { label: "Open" },
    ],
  },
  {
    name: "Data",
    url: "#",
    icon: Database,
    actions: [
      { label: "Open" },
    ],
  },
  {
    name: "Analytics",
    url: "#",
    icon: BarChart2,
    actions: [
      { label: "Open" },
    ],
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NavLinks() {
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {navLinks.map((item) => (
          <SidebarMenuItem key={item.name}>
            {/* Primary link button */}
            <SidebarMenuButton asChild>
              <a href={item.url}>
                <item.icon />
                <span>{item.name}</span>
              </a>
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
                    <DropdownMenuItem
                      key={action.label}
                      onClick={action.onClick}
                    >
                      <span>{action.label}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
