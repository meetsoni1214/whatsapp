import type { PublicUser } from "@event-chat/contracts";
import { LogOut, MessageSquareMore, Search } from "lucide-react";
import { AppBrand } from "@/components/app-brand";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useLogout } from "@/features/auth/queries";

export type Workspace = "conversations" | "people";

interface AppSidebarProps {
  activeWorkspace: Workspace;
  onNavigate: (workspace: Workspace) => void;
  user: PublicUser;
}

export function AppSidebar({
  activeWorkspace,
  onNavigate,
  user,
}: AppSidebarProps) {
  const logout = useLogout();

  return (
    <aside className="flex flex-col bg-foreground px-5 py-5 text-background lg:min-h-svh lg:px-6 lg:py-7">
      <div className="flex w-full items-center justify-between lg:block">
        <AppBrand inverted className="lg:px-2" />

        <nav aria-label="Workspace" className="mt-16 hidden space-y-1 lg:block">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-background/55 hover:bg-background/8 hover:text-background",
              activeWorkspace === "people" && "bg-background/8 text-background",
            )}
            onClick={() => onNavigate("people")}
          >
            <Search className="text-emerald-300" />
            Find people
          </Button>
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-background/55 hover:bg-background/8 hover:text-background",
              activeWorkspace === "conversations" &&
                "bg-background/8 text-background",
            )}
            onClick={() => onNavigate("conversations")}
          >
            <MessageSquareMore />
            Conversations
          </Button>
        </nav>

        <div className="flex items-center gap-3 lg:hidden">
          <UserAvatar username={user.username} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Log out"
            className="text-background/65 hover:bg-background/10 hover:text-background"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut />
          </Button>
        </div>
      </div>

      <nav
        aria-label="Mobile workspace"
        className="mt-4 grid w-full grid-cols-2 border-t border-background/15 pt-3 lg:hidden"
      >
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none text-background/50 hover:bg-background/8 hover:text-background",
            activeWorkspace === "conversations" && "text-emerald-300",
          )}
          onClick={() => onNavigate("conversations")}
        >
          <MessageSquareMore />
          Conversations
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "rounded-none text-background/50 hover:bg-background/8 hover:text-background",
            activeWorkspace === "people" && "text-emerald-300",
          )}
          onClick={() => onNavigate("people")}
        >
          <Search />
          Find people
        </Button>
      </nav>

      <div className="mt-auto hidden lg:block">
        <Separator className="mb-4 bg-background/15" />
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-2">
          <UserAvatar username={user.username} />
          <div className="grid min-w-0 gap-0.5">
            <strong className="truncate text-xs">{user.username}</strong>
            <span className="text-[10px] text-background/45">
              Authenticated
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Log out"
            className="size-8 text-background/50 hover:bg-background/10 hover:text-background"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
