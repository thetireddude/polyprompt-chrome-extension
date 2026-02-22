import { NextResponse } from "next/server";

export const LOCAL_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-EventSnap-Token"
};

export function localOk(payload, { status = 200 } = {}) {
  return NextResponse.json(payload, {
    status,
    headers: LOCAL_CORS_HEADERS
  });
}

export function localError(error, { status = 400 } = {}) {
  const message = typeof error === "string" ? error : error?.message || "Unexpected error";
  return NextResponse.json(
    {
      ok: false,
      error: message
    },
    {
      status,
      headers: LOCAL_CORS_HEADERS
    }
  );
}

export function localOptions() {
  return new NextResponse(null, {
    status: 204,
    headers: LOCAL_CORS_HEADERS
  });
}
