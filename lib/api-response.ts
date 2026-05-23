import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVER_ERROR";

export function ok<T>(data: T, status = 200, message = "OK") {
  void message;
  return NextResponse.json(data, { status });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown
) {
  return NextResponse.json(
    { ok: false, code, message, details: details ?? null },
    { status }
  );
}
