import { revokeToken } from "@/lib/localDataStore";
import { localError, localOk, localOptions } from "@/lib/localApiResponse";

export async function OPTIONS() {
  return localOptions();
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const requireNotRevoked = body?.require_not_revoked === true;

    const data = await revokeToken(id, { requireNotRevoked });
    if (!data) return localError("Token not found or already revoked.", { status: 404 });

    return localOk({ ok: true, data });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}
