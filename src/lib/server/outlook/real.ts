import "server-only";

// The real Outlook for route handlers: on when the app registration and the encryption key are set.
import { appUrl, microsoftConfig, outlookTokenKey } from "@/lib/server/config";
import { createGraphOutlook } from "./graph";
import type { OutlookDeps } from "./sync";

export function realOutlook(): OutlookDeps {
  const config = microsoftConfig();
  const key = outlookTokenKey();
  if (!config || !key) return null;
  return { service: createGraphOutlook({ ...config, redirectUri: `${appUrl()}/api/outlook/callback` }), key };
}
