import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg-dark)] text-[var(--text-primary)] p-6">
      <h2 className="text-3xl font-bold font-heading">Page Not Found</h2>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Could not find requested resource</p>
      <Link
        href="/dashboard/agent"
        className="mt-6 rounded-xl bg-gradient-to-r from-[#6366f1] to-[#06b6d4] px-5 py-2 text-xs font-semibold text-white shadow-md"
      >
        Return to Agent Canvas
      </Link>
    </div>
  );
}
