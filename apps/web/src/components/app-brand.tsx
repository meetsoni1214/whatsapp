import { cn } from "@/lib/utils";

interface AppBrandProps {
  className?: string;
  inverted?: boolean;
}

function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-8 items-end justify-center gap-[3px] rounded-full border border-current p-[7px]"
    >
      <span className="h-[7px] w-[3px] rounded-full bg-current" />
      <span className="h-[14px] w-[3px] rounded-full bg-current" />
      <span className="h-[10px] w-[3px] rounded-full bg-current" />
    </span>
  );
}

export function AppBrand({ className, inverted = false }: AppBrandProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 text-xs font-bold tracking-[0.12em] uppercase",
        inverted ? "text-[#edf5f0]" : "text-foreground",
        className,
      )}
    >
      <BrandMark />
      <span>event / chat</span>
    </div>
  );
}
