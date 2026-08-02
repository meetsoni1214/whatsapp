import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  username: string;
  className?: string;
}

export function UserAvatar({ username, className }: UserAvatarProps) {
  return (
    <Avatar className={cn("size-9", className)}>
      <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground uppercase">
        {username.slice(0, 1)}
      </AvatarFallback>
    </Avatar>
  );
}
