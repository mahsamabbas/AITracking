"use client";

import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";

export type LoginHeroSlide = {
  image: string;
  eyebrow: string;
  title: string;
  body: string;
};

const SLIDES: LoginHeroSlide[] = [
  {
    image: "/login/hero-sessions.png",
    eyebrow: "Operational visibility",
    title: "See what the agent performed",
    body:
      "Sessions, file changes, and tool use from connected AI coding agents — structured for managers and developers on the same facts.",
  },
  {
    image: "/login/hero-privacy.png",
    eyebrow: "Privacy by design",
    title: "Allowlist metadata only",
    body:
      "No prompts, responses, source code, keystrokes, or screenshots. Missing telemetry is a coverage gap — never proof of inactivity.",
  },
  {
    image: "/login/hero-ship.png",
    eyebrow: "Delivery signals",
    title: "Verify & ship in context",
    body:
      "Commits in repos the agents work in, with whether checks ran and changes reached the remote — counts and states, not message bodies.",
  },
];

const INTERVAL_MS = 7000;

export function LoginHeroCarousel({
  slides = SLIDES,
  footer,
}: {
  slides?: LoginHeroSlide[];
  /** Optional panel below the copy (e.g. local demo accounts). */
  footer?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reduceMotion || slides.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion, slides.length]);

  const slide = slides[index]!;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        {slides.map((s, i) => (
          <div
            key={s.image}
            className={`absolute inset-0 transition-opacity duration-[1200ms] ease-out ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.image}
              alt=""
            className={`h-full w-full object-cover ${i === index && !reduceMotion ? "login-hero-ken-burns" : ""}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/35" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/40 to-transparent" />
          </div>
        ))}
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end px-10 py-12">
        <div
          key={index}
          className={`max-w-lg ${reduceMotion ? "" : "login-hero-copy-in"}`}
        >
          <p className="label text-brand-200">{slide.eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{slide.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{slide.body}</p>
          <p className="mt-4 text-2xs font-medium uppercase tracking-wider text-slate-500">{BRAND.name}</p>
        </div>

        <div className="mt-8 flex items-center gap-2" role="tablist" aria-label="Hero highlights">
          {slides.map((s, i) => (
            <button
              key={s.image}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Show slide ${i + 1}: ${s.title}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-8 bg-brand-400" : "w-1.5 bg-white/30 hover:bg-white/50"
              }`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>

        {footer ? <div className="mt-8 min-h-0 shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
