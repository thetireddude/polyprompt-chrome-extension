import { createToken, listTokens } from "@/lib/localDataStore";
import { localError, localOk, localOptions } from "@/lib/localApiResponse";

export async function OPTIONS() {
  return localOptions();
}

export async function GET() {
  try {
    const data = await listTokens();
    return localOk({ ok: true, data });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    if (!Array.isArray(body?.rows) || !body.rows.length) {
      return localError("Request must include a non-empty `rows` array.");
    }

    const row = await createToken(body.rows[0]);
    return localOk({ ok: true, data: row }, { status: 201 });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}
