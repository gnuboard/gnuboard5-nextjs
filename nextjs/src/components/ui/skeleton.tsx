import { cn } from "@/lib/utils";

function Skeleton({
  className,
  role = "status",
  "aria-label": ariaLabel = "로딩 중",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton rounded-md", className)}
      role={role}
      aria-label={ariaLabel}
      {...props}
    />
  );
}

export { Skeleton };
