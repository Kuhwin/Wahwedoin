import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="text-center space-y-6 px-4">
        <div className="text-7xl font-bold text-slate-200 dark:text-slate-800">404</div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Page not found
        </h1>
        <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
