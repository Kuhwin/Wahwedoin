import { NextResponse } from "next/server";

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
      // Handle folded lines (continuation lines start with space/tab)
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

    // Parse date: handle both DATE (YYYYMMDD) and DATETIME (YYYYMMDDTHHMMSSZ)
    function parseDate(val: string): string {
      const clean = val.replace(/[^0-9T]/g, "");
      if (clean.length === 8) {
        // All-day: YYYYMMDD
        return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
      }
      if (clean.length >= 15) {
        // YYYYMMDDTHHMMSS
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

    // Clean title (remove escaped characters)
    const title = rawSummary
      .replace(/\\,/g, ",")
      .replace(/\\;/g, ";")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      || "Untitled Event";

    // Clean description
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
  try {
    const { url, color } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL
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
        { error: `Failed to fetch calendar (HTTP ${response.status})` },
        { status: 502 }
      );
    }

    const text = await response.text();
    const events = parseICal(text, color || "#6366f1");

    return NextResponse.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
