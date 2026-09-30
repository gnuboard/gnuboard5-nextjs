import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-[120px] w-full rounded-[4px] border border-[#dadce0] bg-white px-3 py-2 text-sm text-[#333] outline-none transition-[border-color,box-shadow]",
        "placeholder:text-[#6b7280] focus-visible:border-[#03C75A] focus-visible:ring-2 focus-visible:ring-[#03C75A]/15",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-[#f5f6f7] disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
