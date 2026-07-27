"use client";

import { useEffect } from "react";
import Button from "@/components/ui/Button";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Project error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
      <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
      <p className="text-muted-foreground text-sm">An unexpected error occurred while loading this project.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
