import Link from 'next/link';
import Image from 'next/image';
import { TellsightLogo } from '@/components/common/TellsightLogo';

function GridBg() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0 opacity-[0.25] dark:opacity-[0.08]"
        style={{
          backgroundImage: 'radial-gradient(circle, var(--color-border) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at 70% 20%, transparent 20%, var(--color-background) 70%)',
        }}
      />
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <TellsightLogo size={24} />
            Tellsight
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Demo
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero — left-heavy, asymmetric */}
      <section className="relative overflow-hidden">
        <GridBg />
        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-16 md:px-6 md:pb-12 md:pt-24">
          <p className="text-sm font-medium tracking-wide text-primary">
            For small business owners who avoid spreadsheets
          </p>
          <h1 className="mt-3 max-w-xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">
            Upload a CSV.<br />
            Get a plain-English summary of what your numbers mean.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
            Square export, QuickBooks CSV, bank statement — whatever you have.
            Charts show up instantly. Then AI reads the patterns and tells you
            what to actually do about them.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
            >
              Try the demo — no signup
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sign in with Google
            </Link>
          </div>
        </div>
      </section>

      {/* Screenshot — full width, the real product */}
      <section className="relative border-y border-border/40">
        <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
          <div className="overflow-hidden rounded-xl border border-border/60 shadow-2xl">
            <Image
              src="/dashboard-preview.png"
              alt="Tellsight dashboard showing revenue trends, expense breakdown, and AI-generated analysis for a small business"
              width={1200}
              height={720}
              className="w-full"
              priority
            />
          </div>
        </div>
      </section>

      {/* Insight showcase — the thing that makes this different */}
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid gap-10 md:grid-cols-[1fr_1.3fr] md:items-start md:gap-16">
            <div>
              <p className="text-sm font-medium text-primary">What you get</p>
              <h2 className="mt-2 text-2xl font-bold text-foreground md:text-3xl">
                Not just charts.<br />
                An actual explanation.
              </h2>
              <p className="mt-4 text-muted-foreground">
                This is real output from the demo — a landscaping company's
                12 months of Square data. The AI noticed the seasonal dip and
                connected it to their snow removal revenue gap.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                Every insight links back to the exact numbers. Click
                "How I reached this conclusion" to see the statistical basis.
              </p>
            </div>

            <div className="rounded-xl border border-border/40 bg-ai-surface p-5 shadow-lg md:p-7">
              <div className="text-sm font-medium text-foreground/60">AI Analysis</div>
              <div className="mt-3 space-y-3 text-[15px] leading-[1.8] text-card-foreground">
                <p>
                  November revenue dropped <span className="font-semibold text-accent-warm">23%</span> compared
                  to October, but this lines up with a seasonal pattern visible in both years of data.
                </p>
                <p className="text-card-foreground/70">
                  The dip comes from residential landscaping jobs declining as temperatures drop.
                  Snow removal revenue typically starts in the second half of December. If you're
                  planning crew schedules, the gap between late November and mid-December is
                  where you'll feel the squeeze.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-border/30 pt-3">
                <span className="text-xs text-muted-foreground">Based on 847 transactions across 5 expense categories</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — 3 steps, not 4 features */}
      <section className="border-t border-border/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid gap-8 md:grid-cols-3 md:gap-12">
            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</div>
              <h3 className="mt-3 text-base font-semibold text-foreground">Upload your CSV</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Export from Square, QuickBooks, Wave, or any tool.
                We need date, amount, and category columns — that's it.
                Bad rows get flagged, not silently dropped.
              </p>
            </div>

            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</div>
              <h3 className="mt-3 text-base font-semibold text-foreground">See your charts</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Revenue trend, expense breakdown, profit margin,
                year-over-year comparison. Filter by date or category.
                Charts are free forever.
              </p>
            </div>

            <div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</div>
              <h3 className="mt-3 text-base font-semibold text-foreground">Read what it means</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                AI reads your trends, spots anomalies, and writes a summary
                your business partner would understand. Free tier gets a preview;
                Pro gets the full analysis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip — concrete details, not marketing */}
      <section className="border-t border-border/40 bg-muted/30">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px md:grid-cols-4">
          {[
            { label: 'Setup time', value: 'Under 5 minutes' },
            { label: 'Sign in', value: 'Google account' },
            { label: 'Privacy', value: 'Raw data never reaches AI' },
            { label: 'Charts', value: 'Free forever' },
          ].map((stat) => (
            <div key={stat.label} className="bg-background px-6 py-5 text-center">
              <div className="text-sm font-semibold text-foreground">{stat.value}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA — short */}
      <section className="border-t border-border/40">
        <div className="mx-auto max-w-6xl px-4 py-16 text-center md:px-6 md:py-20">
          <h2 className="text-2xl font-bold text-foreground">
            The demo is live. Go look at it.
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            No signup, no credit card, no "book a call." It runs on sample data
            from a coffee shop — 12 months of revenue and expenses.
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-block rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
          >
            Explore the demo
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="mx-auto max-w-6xl px-4 py-5 md:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TellsightLogo size={16} />
              Tellsight
            </div>
            <p className="text-xs text-muted-foreground">
              AI-powered analytics for small business
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
