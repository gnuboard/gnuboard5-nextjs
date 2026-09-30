"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <span className="relative inline-flex items-center">
    <input
      type="checkbox"
      ref={ref}
      className="peer sr-only"
      {...props}
    />
    <div
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-primary ring-offset-background peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:[&>svg]:block peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
    >
      <Check className="h-3 w-3 hidden peer-checked:block" />
    </div>
  </span>
))
Checkbox.displayName = "Checkbox"

export { Checkbox }
