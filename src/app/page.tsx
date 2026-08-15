import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-background">
      <main className="mx-auto flex w-full max-w-[1152px] flex-1 flex-col justify-center px-6 py-24">
        <div className="tc-measure">
          <span className="mb-4 block font-medium text-body-subtle text-xs uppercase tracking-[0.1em]">
            AI-first HRIS
          </span>
          <h1>Cayamanan</h1>
          <p className="text-[1.25rem] leading-[1.7] text-body">
            Payroll is the mission-critical core. Employees, contracts,
            attendance, leave and benefits are built around it — multi-company
            and multi-tenant from the first record.
          </p>
          <p className="text-body">
            Deterministic software is authoritative for every payroll
            calculation. The assistant explains, flags and assists; it never
            computes the amount.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row">
          <Link
            className="tc-btn-brand inline-flex h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-6 font-medium text-[0.9375rem] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
            href="/chat"
          >
            Open the assistant
          </Link>
        </div>
      </main>
    </div>
  );
}
