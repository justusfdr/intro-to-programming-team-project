import { uploadProfilePhoto } from "@/lib/server/actions/profile-photo";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the action itself (and its tests) live in src/lib/server/actions/profile-photo.ts.
export async function POST(request: Request): Promise<Response> {
  return uploadProfilePhoto(request, await realDeps());
}
