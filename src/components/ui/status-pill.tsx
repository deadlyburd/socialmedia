import { cn } from "@/lib/utils";

type PillVariant = "default" | "success" | "warning" | "danger" | "info";

const PILL_STYLES: Record<PillVariant, string> = {
  default: "bg-muted text-muted-foreground",
  success: "bg-mint text-mint-foreground",
  warning: "bg-yellow text-yellow-foreground",
  danger: "bg-pink text-pink-foreground",
  info: "bg-blue text-blue-foreground",
};

interface StatusPillProps {
  label: string;
  variant?: PillVariant;
  className?: string;
}

export function StatusPill({ label, variant = "default", className }: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium",
        PILL_STYLES[variant],
        className,
      )}
    >
      {label}
    </span>
  );
}
