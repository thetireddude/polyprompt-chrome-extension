import {
  listEvents,
  upsertExtensionEvent
} from "@/lib/localDataStore";
import { localError, localOk, localOptions } from "@/lib/localApiResponse";

export async function OPTIONS() {
  return localOptions();
}

export async function GET() {
  try {
    const data = await listEvents();
    return localOk({ ok: true, data });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (body?.event && typeof body.event === "object") {
      const row = await upsertExtensionEvent(body.event);
      return localOk({ ok: true, data: row });
    }

    return localError("Manual dashboard event creation is disabled. Send `event` from the extension.");
  } catch (error) {
    return localError(error, { status: 500 });
  }
}
