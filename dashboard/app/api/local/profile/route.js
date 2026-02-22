import { getProfile, upsertProfile } from "@/lib/localDataStore";
import { localError, localOk, localOptions } from "@/lib/localApiResponse";

export async function OPTIONS() {
  return localOptions();
}

export async function GET() {
  try {
    const data = await getProfile();
    return localOk({ ok: true, data });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const data = await upsertProfile(body?.profile ?? body);
    return localOk({ ok: true, data });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}
