import Image from "next/image";
import Link from "next/link";

const agents = [
  { name: "Alex", role: "Chief of Staff", description: "Orchestrates your team and synthesizes insights across every department." },
  { name: "Jeremy", role: "CFO", description: "Financial modeling, unit economics, and capital allocation strategy." },
  { name: "Kai", role: "CTO", description: "Technical architecture, engineering decisions, and product roadmap." },
  { name: "Dana", role: "Head of Sales", description: "Go-to-market, pipeline strategy, and partnership development." },
  { name: "Marcus", role: "General Counsel", description: "Legal structure, compliance, contracts, and risk management." },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-[#1C1C1E] font-sans">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-5 bg-white/90 backdrop-blur-md border-b border-black/5">
        <Image src="/knetc-logo.png" alt="knetc team" width={120} height={32} className="h-8 w-auto" />
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[#1C1C1E]/60 hover:text-[#1C1C1E] transition-colors px-4 py-2">
            Sign in
          </Link>
          <Link href="/signup" className="text-sm bg-[#1C1C1E] text-white px-5 py-2.5 rounded-full hover:bg-black transition-colors font-medium">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-28 px-6 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 bg-[#1C1C1E]/5 border border-black/8 rounded-full px-4 py-1.5 text-xs font-medium text-[#1C1C1E]/60 mb-8 tracking-wide uppercase">
          AI-Powered Virtual Team
        </div>
        <h1 className="text-6xl sm:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
          Your executive team,<br />
          <span className="relative inline-block">
            always on.
            <span className="absolute -bottom-1 left-0 right-0 h-[3px] bg-[#1C1C1E] rounded-full" />
          </span>
        </h1>
        <p className="text-xl text-[#1C1C1E]/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          knetc gives founders and operators a full AI leadership team — CFO, CTO, Head of Sales, and General Counsel — available instantly, around the clock.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/signup" className="w-full sm:w-auto bg-[#1C1C1E] text-white px-8 py-4 rounded-full text-base font-semibold hover:bg-black transition-colors">
            Start for free
          </Link>
          <Link href="/login" className="w-full sm:w-auto border border-black/15 text-[#1C1C1E] px-8 py-4 rounded-full text-base font-semibold hover:border-black/30 transition-colors">
            Sign in
          </Link>
        </div>
      </section>

      {/* Agents grid */}
      <section className="py-24 px-6 bg-[#F9F9F9] border-y border-black/5">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs font-semibold uppercase tracking-widest text-[#1C1C1E]/40 mb-12">Your team</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div key={agent.name} className="bg-white border border-black/6 rounded-2xl p-6 hover:border-black/15 transition-colors">
                <div className="w-10 h-10 rounded-full bg-[#1C1C1E] flex items-center justify-center mb-4">
                  <span className="text-white text-sm font-bold">{agent.name[0]}</span>
                </div>
                <div className="text-xs font-semibold uppercase tracking-widest text-[#1C1C1E]/40 mb-1">{agent.role}</div>
                <div className="font-semibold text-[#1C1C1E] mb-2">{agent.name}</div>
                <p className="text-sm text-[#1C1C1E]/50 leading-relaxed">{agent.description}</p>
              </div>
            ))}
            {/* Boardroom card */}
            <div className="bg-[#1C1C1E] border border-black/6 rounded-2xl p-6 sm:col-span-2 lg:col-span-1">
              <div className="flex gap-1.5 mb-4">
                {["A","J","K","D","M"].map((l) => (
                  <div key={l} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{l}</span>
                  </div>
                ))}
              </div>
              <div className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-1">All agents</div>
              <div className="font-semibold text-white mb-2">The Boardroom</div>
              <p className="text-sm text-white/50 leading-relaxed">Bring the whole team together for complex decisions that span every function.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-12">
          {[
            { label: "Always available", body: "No scheduling, no delays. Ask a question and get a considered expert answer in seconds." },
            { label: "Full context memory", body: "Your team remembers every conversation, decision, and document — so you never repeat yourself." },
            { label: "Built for founders", body: "From pre-seed to scale, knetc adapts to the problems that matter most at your stage." },
          ].map((f) => (
            <div key={f.label}>
              <div className="w-8 h-8 rounded-full border-2 border-[#1C1C1E] mb-5" />
              <h3 className="font-semibold text-lg mb-2">{f.label}</h3>
              <p className="text-[#1C1C1E]/50 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 px-6 bg-[#1C1C1E] text-white text-center">
        <Image src="/knetc-logo.png" alt="knetc team" width={100} height={28} className="h-7 w-auto mx-auto mb-10 invert" />
        <h2 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">Ready to meet your team?</h2>
        <p className="text-white/50 mb-10 text-lg max-w-xl mx-auto">Sign up in seconds. No credit card required.</p>
        <Link href="/signup" className="inline-block bg-white text-[#1C1C1E] px-10 py-4 rounded-full text-base font-semibold hover:bg-white/90 transition-colors">
          Get started free
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-8 px-8 border-t border-black/5 flex items-center justify-between text-xs text-[#1C1C1E]/35">
        <Image src="/knetc-logo.png" alt="knetc team" width={80} height={22} className="h-5 w-auto opacity-40" />
        <span>© {new Date().getFullYear()} knetc. All rights reserved.</span>
      </footer>
    </div>
  );
}
