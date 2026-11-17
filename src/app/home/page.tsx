import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import "./landing.css";

export const metadata: Metadata = {
  title: "The calendar that protects your focus",
  description: "LockedIn plans your week around your goals, blocks time for deep work and keeps distractions out while you focus.",
};

// The landing page (spec 45): open to everyone, no sign-in and no data (src/lib/route-guard.ts lets
// it through). "Log in" leads to /sign-in, "Start for free" to /sign-up.
export default function HomePage() {
  return <Landing />;
}
