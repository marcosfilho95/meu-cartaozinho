import React from "react";
import { getAvatarById } from "@/data/avatars";

interface UserAvatarProps {
  avatarId?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({ avatarId, name, size = 40, className = "" }) => {
  const avatar = getAvatarById(avatarId);
  const initials = (name || "U")
    .trim()
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className={`relative overflow-hidden rounded-full border-2 border-white/60 shadow-md ${className}`}
      style={{ width: size, height: size }}
      title={name || "Perfil"}
    >
      <img src={avatar.src} alt={avatar.label} className="h-full w-full object-cover" />
      <span className="absolute bottom-0 right-0 rounded-tl-md bg-white/85 px-1 text-[10px] font-bold text-foreground">
        {initials}
      </span>
    </div>
  );
};

