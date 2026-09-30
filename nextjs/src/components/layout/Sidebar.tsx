"use client"

import * as React from "react"
import { G5Link as Link } from "@/components/ui/g5-link";
import { usePathname } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface SidebarItem {
  href: string
  label: string
  icon?: React.ReactNode
  children?: SidebarItem[]
}

interface SidebarProps {
  title?: string
  items: SidebarItem[]
  className?: string
}

function Sidebar({ title, items, className }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 border-r bg-background p-4",
        className
      )}
    >
      {title && (
        <>
          <h2 className="px-2 text-lg font-semibold">{title}</h2>
          <Separator className="my-2" />
        </>
      )}
      <nav className="flex flex-col gap-1">
        {items.map((item) => (
          <SidebarNavItem
            key={item.href}
            item={item}
            pathname={pathname}
          />
        ))}
      </nav>
    </aside>
  )
}

function SidebarNavItem({
  item,
  pathname,
}: {
  item: SidebarItem
  pathname: string
}) {
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
  const [expanded, setExpanded] = React.useState(isActive)

  if (item.children && item.children.length > 0) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
            isActive && "bg-accent text-accent-foreground"
          )}
        >
          <span className="flex items-center gap-2">
            {item.icon}
            {item.label}
          </span>
          <ChevronRightIcon
            className={cn(
              "size-4 transition-transform",
              expanded && "rotate-90"
            )}
          />
        </button>
        {expanded && (
          <div className="ml-4 mt-1 flex flex-col gap-1 border-l pl-2">
            {item.children.map((child) => (
              <SidebarNavItem
                key={child.href}
                item={child}
                pathname={pathname}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      size="sm"
      className="justify-start"
      asChild
    >
      <Link href={item.href}>
        {item.icon}
        {item.label}
      </Link>
    </Button>
  )
}

export { Sidebar }
export type { SidebarItem, SidebarProps }
export default Sidebar
