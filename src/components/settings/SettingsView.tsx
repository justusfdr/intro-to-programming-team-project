// The settings page's content (spec 12), in the prototype's layout: the title, then one column of cards,
// Outlook first. The page (src/app/settings/page.tsx) loads the data on the server.
import { PageHeader } from "@/components/ui/Card";
import type { BlockerData } from "@/lib/blocker/types";
import type { OwnProfile } from "@/lib/profiles/types";
import type { SettingsPageData } from "@/lib/settings/types";
import { BlockerCard } from "./BlockerCard";
import { OutlookCard } from "./OutlookCard";
import { PreferencesCard } from "./PreferencesCard";
import { ProfileRow } from "./ProfileRow";
import { TravelCard } from "./TravelCard";
import { YourAccountCard } from "./YourAccountCard";

export function SettingsView({
  data,
  blocker,
  profile,
}: {
  data: SettingsPageData;
  blocker: BlockerData;
  /** The user's own profile: the row "Your profile" at the top (spec 31). Left out where it is not loaded. */
  profile?: OwnProfile;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-6 md:px-8 md:py-8">
      <PageHeader title="Settings" subtitle="Your profile, calendar, preferences, travel, the focus blocker and your account." />
      <div className="flex max-w-3xl flex-col gap-4">
        {profile && <ProfileRow profile={profile} />}
        <OutlookCard outlook={data.outlook} outlookAvailable={data.outlookAvailable} today={data.today} timeZone={data.settings.timeZone} />
        <PreferencesCard settings={data.settings} defaultView={data.defaultView} />
        <TravelCard settings={data.settings} />
        <BlockerCard data={blocker} />
        <YourAccountCard hasDemo={data.hasDemo} plan={data.plan} />
      </div>
    </div>
  );
}
