// The settings page's content (spec 12), in the prototype's layout: the title, then one column of cards,
// Outlook first. The page (src/app/settings/page.tsx) loads the data on the server.
import { PageHeader } from "@/components/ui/Card";
import type { BlockerData } from "@/lib/blocker/types";
import type { SettingsPageData } from "@/lib/settings/types";
import { BlockerCard } from "./BlockerCard";
import { OutlookCard } from "./OutlookCard";
import { PreferencesCard } from "./PreferencesCard";
import { TravelCard } from "./TravelCard";
import { YourAccountCard } from "./YourAccountCard";

export function SettingsView({
  data,
  blocker,
  timeZones,
}: {
  data: SettingsPageData;
  blocker: BlockerData;
  timeZones: string[];
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <PageHeader title="Settings" subtitle="Calendar, preferences, travel, the focus blocker and your account." />
      <div className="flex max-w-3xl flex-col gap-4">
        <OutlookCard outlook={data.outlook} outlookAvailable={data.outlookAvailable} today={data.today} timeZone={data.settings.timeZone} />
        <PreferencesCard settings={data.settings} defaultView={data.defaultView} timeZones={timeZones} />
        <TravelCard settings={data.settings} />
        <BlockerCard data={blocker} />
        <YourAccountCard hasDemo={data.hasDemo} plan={data.plan} />
      </div>
    </div>
  );
}
