// The landing page (spec 45): what a visitor sees before signing in. It shows no data of any user;
// every graphic is a drawing with made-up events. Its moves live in src/app/home/landing.css.
import { Footer } from "./Footer";
import { Hero } from "./Hero";
import { LandingNav } from "./LandingNav";
import { Founder, LastCall, Plans, Questions, Tools } from "./Sections";
import { Steps } from "./Steps";

export function Landing() {
  return (
    <div className="landing flex min-h-dvh flex-col overflow-x-clip bg-canvas text-ink">
      <LandingNav />
      <main>
        <Hero />
        <Steps />
        <Founder />
        <Tools />
        <Plans />
        <Questions />
        <LastCall />
      </main>
      <Footer />
    </div>
  );
}
