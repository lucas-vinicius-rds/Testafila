import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const UPSTREAM_TIMEOUT_MS = 10_000;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function connectionNamedHeaders(headers: Headers): Set<string> {
  return new Set(
    (headers.get("connection") ?? "")
      .split(",")
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean),
  );
}

function shouldDropHeader(name: string, connectionHeaders: Set<string>): boolean {
  const normalized = name.toLowerCase();
  return HOP_BY_HOP_HEADERS.has(normalized)
    || connectionHeaders.has(normalized)
    || normalized === "host"
    || normalized === "forwarded"
    || normalized.startsWith("x-forwarded-")
    || normalized === "content-length"
    || normalized === "accept-encoding";
}

function forwardRequestHeaders(source: Headers): Headers {
  const headers = new Headers();
  const connectionHeaders = connectionNamedHeaders(source);
  for (const [name, value] of source.entries()) {
    if (shouldDropHeader(name, connectionHeaders)) continue;
    headers.set(name, value);
  }
  return headers;
}

async function proxy(request: NextRequest): Promise<NextResponse> {
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    const baseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";
    const target = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, baseUrl);
    const upstream = await fetch(target, {
      method,
      headers: forwardRequestHeaders(request.headers),
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const responseHeaders = new Headers();
    const connectionHeaders = connectionNamedHeaders(upstream.headers);
    for (const [name, value] of upstream.headers.entries()) {
      const normalized = name.toLowerCase();
      if (shouldDropHeader(name, connectionHeaders) || normalized === "content-encoding") continue;
      if (normalized === "set-cookie") continue;
      responseHeaders.append(name, value);
    }
    if (!connectionHeaders.has("set-cookie")) {
      for (const cookie of upstream.headers.getSetCookie()) {
        responseHeaders.append("set-cookie", cookie);
      }
    }
    responseHeaders.set("cache-control", "no-store");

    const body = method === "HEAD" || upstream.status === 204 || upstream.status === 304
      ? null
      : await upstream.arrayBuffer();

    return new NextResponse(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "API_UNAVAILABLE", message: "Serviço indisponível. Tente novamente." } },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
