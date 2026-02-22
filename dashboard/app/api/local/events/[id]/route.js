import { deleteEventById, getEventById, updateEventById } from "@/lib/localDataStore";
import { localError, localOk, localOptions } from "@/lib/localApiResponse";

export async function OPTIONS() {
  return localOptions();
}

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const row = await getEventById(id);
    if (!row) return localError("Event not found.", { status: 404 });
    return localOk({ ok: true, data: row });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const values = body?.values ?? body;
    const updated = await updateEventById(id, values);
    if (!updated) return localError("Event not found.", { status: 404 });
    return localOk({ ok: true, data: updated });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  try {
    const { id } = await params;
    const deleted = await deleteEventById(id);
    if (!deleted) return localError("Event not found.", { status: 404 });
    return localOk({ ok: true, data: null });
  } catch (error) {
    return localError(error, { status: 500 });
  }
}
