import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PastelBg = "pink" | "lavender" | "mint" | "yellow" | "blue";

const BG_MAP: Record<PastelBg, string> = {
  pink: "bg-pink",
  lavender: "bg-lavender",
  mint: "bg-mint",
  yellow: "bg-yellow",
  blue: "bg-blue",
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  bg?: PastelBg;
  sub?: string;
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  bg = "pink",
  sub,
  onClick,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        BG_MAP[bg],
        "rounded-[24px] p-6 transition-all duration-300",
        onClick && "cursor-pointer hover-lift",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <Icon className="h-4 w-4 opacity-50" />
      </div>
      <div className="text-[36px] font-semibold tracking-tight leading-none">
        {value}
      </div>
      {sub && (
        <p className="text-xs text-muted-foreground mt-2">{sub}</p>
      )}
    </div>
  );
}
