import { describe, it, expect } from "vitest";
import { isSafeUrl } from "../security";

describe("isSafeUrl", () => {
  it("allows https public URLs", () => {
    expect(isSafeUrl("https://example.com/feed.ics")).toBe(true);
    expect(isSafeUrl("https://calendar.google.com/calendar/ical/foo/basic.ics")).toBe(true);
  });

  it("rejects non-https protocols", () => {
    expect(isSafeUrl("http://example.com/feed.ics")).toBe(false);
    expect(isSafeUrl("ftp://example.com")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects blocked hostnames", () => {
    expect(isSafeUrl("https://localhost/feed.ics")).toBe(false);
    expect(isSafeUrl("https://127.0.0.1/feed.ics")).toBe(false);
    expect(isSafeUrl("https://metadata.google.internal/")).toBe(false);
    expect(isSafeUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("rejects private IP ranges", () => {
    expect(isSafeUrl("https://10.0.0.1/")).toBe(false);
    expect(isSafeUrl("https://172.16.0.1/")).toBe(false);
    expect(isSafeUrl("https://172.31.255.255/")).toBe(false);
    expect(isSafeUrl("https://192.168.1.1/")).toBe(false);
    expect(isSafeUrl("https://0.0.0.0/")).toBe(false);
  });

  it("rejects ipv6 loopback and link-local", () => {
    expect(isSafeUrl("https://[::1]/")).toBe(false);
    expect(isSafeUrl("https://[fe80::1]/")).toBe(false);
    expect(isSafeUrl("https://[fc00::1]/")).toBe(false);
  });

  it("rejects integer and hex IPv4 encodings of private addresses", () => {
    expect(isSafeUrl("https://2130706433/")).toBe(false); // 127.0.0.1
    expect(isSafeUrl("https://0x7f000001/")).toBe(false); // 127.0.0.1
    expect(isSafeUrl("https://0x7f.0.0.1/")).toBe(false);
    expect(isSafeUrl("https://0177.0.0.1/")).toBe(false); // octal 127.0.0.1
    expect(isSafeUrl("https://3232235777/")).toBe(false); // 192.168.1.1
    expect(isSafeUrl("https://2852039166/")).toBe(false); // 169.254.169.254
  });

  it("rejects raw public IP hostnames", () => {
    expect(isSafeUrl("https://93.184.216.34/")).toBe(false);
    expect(isSafeUrl("https://1.1.1.1/")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeUrl("not a url")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });
});
