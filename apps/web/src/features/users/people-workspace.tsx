import { useState } from "react";
import { AlertCircle, LoaderCircle, Search, ShieldCheck } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserSearch } from "@/features/users/queries";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

function SearchPlaceholder() {
  return (
    <div className="space-y-3 py-8" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <div className="flex h-[4.75rem] items-center gap-4" key={item}>
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-2.5 w-56 max-w-[60%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeopleWorkspace() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const debouncedQuery = useDebouncedValue(normalizedQuery, 250);
  const searchResult = useUserSearch(debouncedQuery);
  const results = searchResult.data ?? [];
  const isDebouncing = normalizedQuery !== debouncedQuery;
  const isSearching = isDebouncing || searchResult.isFetching;
  const showEmpty =
    normalizedQuery.length > 0 &&
    normalizedQuery === debouncedQuery &&
    !searchResult.isFetching &&
    !searchResult.isError &&
    results.length === 0;

  return (
    <section className="min-w-0 flex-1 bg-[linear-gradient(rgba(16,32,25,0.035)_1px,transparent_1px)] bg-[length:100%_4.5rem] px-6 py-9 sm:px-10 lg:px-[clamp(2.5rem,6vw,5.5rem)] lg:py-13">
      <header className="flex items-start justify-between gap-6">
        <div>
          <p className="mb-4 text-[11px] font-bold tracking-[0.16em] text-primary uppercase">
            User discovery
          </p>
          <h1 className="font-serif text-5xl leading-[0.92] font-normal tracking-[-0.055em] sm:text-6xl lg:text-7xl">
            Find someone
          </h1>
        </div>
        <Badge
          variant="outline"
          className="mt-1 hidden gap-1.5 rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-[10px] font-medium text-muted-foreground sm:flex"
        >
          <ShieldCheck className="size-3 text-primary" />
          Session protected
        </Badge>
      </header>

      <Separator className="mt-8 lg:mt-9" />

      <div className="max-w-3xl py-10 lg:py-12">
        <Label htmlFor="user-search" className="sr-only">
          Search users by username
        </Label>
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-1 size-5 text-primary sm:size-6" />
          <Input
            id="user-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by username"
            autoComplete="off"
            autoFocus
            className="h-15 rounded-none border-0 border-b border-input bg-transparent pr-12 pl-10 font-serif text-2xl tracking-[-0.03em] shadow-none placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-0 sm:h-16 sm:text-4xl"
          />
          {isSearching && (
            <LoaderCircle
              className="absolute right-3 size-4 animate-spin text-primary"
              aria-label="Searching"
            />
          )}
        </div>
        <p className="mt-3 ml-10 text-[10px] text-muted-foreground">
          Type the beginning of a username. Your account is excluded.
        </p>
      </div>

      <section className="max-w-4xl" aria-live="polite" aria-busy={isSearching}>
        <Separator />

        {!normalizedQuery && (
          <div className="max-w-md py-12 lg:py-14">
            <span className="text-[10px] text-primary tabular-nums">01</span>
            <h2 className="mt-4 font-serif text-2xl font-normal tracking-tight">
              Search the directory
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Finding another user is the bridge to direct conversations in Phase 3.
            </p>
          </div>
        )}

        {normalizedQuery && isSearching && results.length === 0 && <SearchPlaceholder />}

        {showEmpty && (
          <div className="max-w-md py-12 lg:py-14">
            <span className="text-[10px] text-primary tabular-nums">00</span>
            <h2 className="mt-4 font-serif text-2xl font-normal tracking-tight">
              No matching users
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Try another username prefix.
            </p>
          </div>
        )}

        {searchResult.isError && (
          <Alert variant="destructive" className="my-8 max-w-xl" role="alert">
            <AlertCircle />
            <AlertDescription>
              {searchResult.error instanceof Error
                ? searchResult.error.message
                : "Search is unavailable."}
            </AlertDescription>
          </Alert>
        )}

        {results.map((result, index) => (
          <div
            className="grid min-h-[4.875rem] animate-in grid-cols-[1.75rem_auto_minmax(0,1fr)] items-center gap-3 border-b border-border fade-in slide-in-from-bottom-1 duration-300 sm:grid-cols-[1.75rem_auto_minmax(0,1fr)_auto] sm:gap-4"
            key={result.id}
          >
            <span className="text-[10px] text-primary tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <UserAvatar username={result.username} />
            <div className="grid min-w-0 gap-0.5">
              <strong className="truncate text-xs">{result.username}</strong>
              <span className="truncate text-[10px] text-muted-foreground">
                Available for a direct conversation
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="col-start-3 ml-auto hidden gap-2 text-[11px] text-muted-foreground sm:flex"
              disabled
            >
              Start chat
              <Badge variant="outline" className="text-[8px] uppercase">
                Phase 3
              </Badge>
            </Button>
          </div>
        ))}
      </section>
    </section>
  );
}
