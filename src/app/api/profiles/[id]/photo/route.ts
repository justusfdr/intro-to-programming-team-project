import { deliverProfilePhoto } from "@/lib/server/actions/deliver-photo";
import { realDeps } from "@/lib/server/deps";

// Thin wrapper: the delivery itself (and its tests) live in src/lib/server/actions/deliver-photo.ts.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return deliverProfilePhoto(await realDeps(), id);
}
