// The blocker data the Focus page gets from the server.

export type BlockedSite = { id: string; domain: string };

export type BlockerData = {
  sites: BlockedSite[];
  /** R18: the extension asked in the last 2 minutes. */
  connected: boolean;
  blockingOn: boolean;
  /** ISO time, or null. */
  blockingUntil: string | null;
  timeZone: string;
};
