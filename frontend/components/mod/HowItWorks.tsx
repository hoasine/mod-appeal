"use client";

import { BookOpen, Brain, Scale, Shield } from "lucide-react";

const steps = [
  {
    icon: Shield,
    title: "Opt into a pinned policy",
    desc: "Users accept the current community policy. Future policy changes require a new accept.",
  },
  {
    icon: BookOpen,
    title: "Publish a case",
    desc: "An authorized moderator locks facts, policy snapshot, and a 0.01 GEN stake.",
  },
  {
    icon: Scale,
    title: "Appeal once",
    desc: "The named user matches the stake and can cancel before judgment. The penalty cannot go up.",
  },
  {
    icon: Brain,
    title: "AI settles or refunds",
    desc: "Uphold, reduce, revoke, or inconclusive. If nobody judges in time, both stakes return.",
  },
];

export function HowItWorks() {
  return (
    <section className="glass-card p-6 md:p-8">
      <h2 className="mb-6 font-display text-2xl font-bold">How ModAppeal works</h2>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <div key={s.title} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
                {i + 1}
              </span>
              <s.icon className="h-5 w-5 text-accent" />
            </div>
            <h3 className="font-semibold">{s.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Rulings are advisory. This contract cannot ban or unban an account on an external platform.
        Do not submit names, private messages, or other personal data — on-chain text is public.
      </p>
    </section>
  );
}
