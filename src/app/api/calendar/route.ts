import { NextResponse } from "next/server";
import { requireAuth, isSafeUrl } from "@/lib/security";
import { rateLimit } from "@/lib/rateLimit";

interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  allDay: boolean;
  color: string;
}

function parseICal(text: string, color: string): CalEvent[] {
  const events: CalEvent[] = [];
  const blocks = text.split("BEGIN:VEVENT");

  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i].split("END:VEVENT")[0];

    const get = (key: string) => {
      const unfolded = block.replace(/\r?\n[ \t]/g, "");
      const match = unfolded.match(new RegExp(`^${key}[;:](.*)$`, "m"));
      return match ? match[1].trim() : "";
    };

    const rawSummary = get("SUMMARY");
    const rawStart = get("DTSTART");
    const rawEnd = get("DTEND");
    const rawDesc = get("DESCRIPTION");
    const uid = get("UID");

    if (!rawStart) continue;

    function parseDate(val: string): string {
      const clean = val.replace(/[^0-9T]/g, "");
      if (clean.length === 8) {
        return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      }
      if (clean.length >= 15) {
        const y = clean.slice(0, 4);
        const m = clean.slice(4, 6);
        const d = clean.slice(6, 8);
        const h = clean.slice(9, 11);
        const min = clean.slice(11, 13);
        return `${y}-${m}-${d}T${h}:${min}:00Z`;
      }
      return val;
    }

    const isAllDay = rawStart.length === 8 || rawStart.endsWith("VALUE=DATE");

    const title = rawSummary
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      || "Untitled Event";

    const description = rawDesc
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\u[\dA-Fa-f]{4}/g, (m) =>
        String.fromCharCode(parseInt(m.slice(2), 16))
      )
      || "";

    events.push({
      id: uid || `ext-${i}`,
      title,
      start: parseDate(rawStart),
      end: rawEnd ? parseDate(rawEnd) : parseDate(rawStart),
      description,
      allDay: isAllDay,
      color,
    });
  }

  return events;
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!rateLimit(`calendar:${auth.user!.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  try {
    const { url, color } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (!isSafeUrl(url)) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: { "User-Agent": "WahWeDoin-Calendar/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch calendar" },
        { status: 502 }
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 5_000_000) {
      return NextResponse.json({ error: "Calendar file too large" }, { status: 413 });
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: "No response body" }, { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const MAX_SIZE = 5_000_000;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > MAX_SIZE) {
        reader.cancel();
        return NextResponse.json({ error: "Calendar file too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const text = new TextDecoder().decode(Buffer.concat(chunks));
    const events = parseICal(text, color || "#6366f1");

    return NextResponse.json({ events });
  } catch {
    return NextResponse.json({ error: "Failed to process calendar" }, { status: 500 });
  }
}
