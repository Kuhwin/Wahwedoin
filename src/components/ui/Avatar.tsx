import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  email: string;
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

export default function Avatar({ email, size = "md", className }: AvatarProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full text-white font-medium shrink-0",
        getColor(email),
        {
          "h-6 w-6 text-[10px]": size === "sm",
          "h-8 w-8 text-xs": size === "md",
          "h-10 w-10 text-sm": size === "lg",
        },
        className
      )}
      title={email}
    >
      {getInitials(email)}
    </div>
  );
}
