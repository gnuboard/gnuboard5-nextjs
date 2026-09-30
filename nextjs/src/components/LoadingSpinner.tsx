import * as React from "react"
import { LoaderCircleIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  size?: "sm" | "default" | "lg"
  className?: string
  text?: string
}

function LoadingSpinner({
  size = "default",
  className,
  text,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "size-4",
    default: "size-8",
    lg: "size-12",
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        className
      )}
      role="status"
      aria-label="로딩 중"
    >
      <LoaderCircleIcon
        className={cn(
          "animate-spin text-muted-foreground",
          sizeClasses[size]
        )}
      />
      {text && (
        <p className="text-sm text-muted-foreground">{text}</p>
      )}
      <span className="sr-only">로딩 중...</span>
    </div>
  )
}

export { LoadingSpinner }
export type { LoadingSpinnerProps }
export default LoadingSpinner
