import { AppBrand } from "@/components/app-brand";
import { Skeleton } from "@/components/ui/skeleton";

export function SessionLoader() {
  return (
    <main
      className="grid min-h-svh place-content-center justify-items-center bg-foreground text-background"
      aria-live="polite"
      aria-busy="true"
    >
      <AppBrand inverted className="mb-8" />
      <Skeleton className="h-px w-[min(17.5rem,70vw)] overflow-hidden bg-background/15">
        <span className="block h-full w-2/5 animate-[loader-line_1s_ease-in-out_infinite] bg-emerald-300" />
      </Skeleton>
      <p className="mt-4 text-[11px] text-background/50">
        Restoring your private session
      </p>
    </main>
  );
}
