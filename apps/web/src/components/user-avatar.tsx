import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  username: string;
  online?: boolean;
  className?: string;
}

export function UserAvatar({
  username,
  className,
  online = false,
}: UserAvatarProps) {
  return (
    <span className={cn("relative block size-9 shrink-0", className)}>
      <Avatar className="size-full">
        <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground uppercase">
          {username.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      {online && (
        <span
          className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-emerald-500"
          aria-label={`${username} is online`}
        />
      )}
    </span>
  );
}
