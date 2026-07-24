import { cn } from "@/lib/utils";

interface AvatarProps {
  name?: string | null;
  email: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-cyan-500",
  "bg-blue-500",
];

function getColor(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name: string | null | undefined, email: string) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const namePart = email.split("@")[0];
  return namePart.slice(0, 2).toUpperCase();
}

export default function Avatar({ name, email, avatarUrl, size = "md", className }: AvatarProps) {
  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
    lg: "h-10 w-10 text-sm",
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || email}
        className={cn(
          "inline-flex items-center justify-center rounded-full shrink-0 object-cover",
          sizeClasses[size],
          className
        )}
        title={name || email}
      />
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-medium shrink-0",
        getColor(email),
        sizeClasses[size],
        className
      )}
      title={name || email}
    >
      {getInitials(name, email)}
    </div>
  );
}
