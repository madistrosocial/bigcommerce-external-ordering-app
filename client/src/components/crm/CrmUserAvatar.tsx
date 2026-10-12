import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getCustomerAvatarColor } from "@/components/crm/CustomerIdentity";

export function CrmUserAvatar({
  userId,
  name,
  thumbnail,
}: {
  userId: number | null;
  name: string;
  thumbnail?: string | null;
}) {
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return (
    <Avatar className="h-8 w-8 shrink-0">
      <AvatarImage src={thumbnail || undefined} alt="" />
      <AvatarFallback className={`text-[11px] font-bold ${getCustomerAvatarColor(userId ?? 0)}`}>{initials || "?"}</AvatarFallback>
    </Avatar>
  );
}
