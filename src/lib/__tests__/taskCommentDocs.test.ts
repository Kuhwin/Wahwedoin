import { describe, it, expect } from "vitest";
import { extractDriveUrls, extractDriveFileId } from "@/lib/taskCommentDocs";

describe("extractDriveUrls", () => {
  it("finds a plain drive share link", () => {
    const body = "Here's the design: https://drive.google.com/file/d/AbC123def/view?usp=sharing";
    expect(extractDriveUrls(body)).toEqual(["https://drive.google.com/file/d/AbC123def/view?usp=sharing"]);
  });

  it("finds multiple urls and dedupes", () => {
    const body =
      "A https://docs.google.com/document/d/Doc1/edit and https://docs.google.com/document/d/Doc1/edit#heading=h.abc";
    expect(extractDriveUrls(body)).toEqual(["https://docs.google.com/document/d/Doc1/edit"]);
  });

  it("finds docs, sheets, slides and open?id forms", () => {
    const body =
      "doc: https://docs.google.com/document/d/X1/edit " +
      "sheet: https://docs.google.com/spreadsheets/d/X2/edit " +
      "slides: https://docs.google.com/presentation/d/X3/edit " +
      "open: https://drive.google.com/open?id=X4";
    const urls = extractDriveUrls(body);
    expect(urls).toHaveLength(4);
    expect(urls.join(" ")).toContain("docs.google.com/document/d/X1/edit");
    expect(urls.join(" ")).toContain("drive.google.com/open?id=X4");
  });

  it("strips trailing punctuation and closing parens", () => {
    expect(extractDriveUrls("see https://drive.google.com/file/d/abc/view?usp=sharing.)")).toEqual([
      "https://drive.google.com/file/d/abc/view?usp=sharing",
    ]);
  });

  it("returns empty array when there are no drive urls", () => {
    expect(extractDriveUrls("no links here, just https://example.com")).toEqual([]);
  });

  it("ignores links that are not google drive/docs", () => {
    const body = "https://www.notion.so/page https://github.com/org/repo";
    expect(extractDriveUrls(body)).toEqual([]);
  });
});

describe("extractDriveFileId", () => {
  it("parses /file/d/{id}", () => {
    expect(extractDriveFileId("https://drive.google.com/file/d/AbC123def/view?usp=sharing")).toBe("AbC123def");
  });

  it("parses open?id={id}", () => {
    expect(extractDriveFileId("https://drive.google.com/open?id=abcDEF123")).toBe("abcDEF123");
  });

  it("parses uc?id={id}", () => {
    expect(extractDriveFileId("https://drive.google.com/uc?id=xyz&export=download")).toBe("xyz");
  });

  it("parses docs document /d/{id}", () => {
    expect(extractDriveFileId("https://docs.google.com/document/d/DOC1/edit#heading=h.x")).toBe("DOC1");
  });

  it("parses sheets and slides /d/{id}", () => {
    expect(extractDriveFileId("https://docs.google.com/spreadsheets/d/SHT2/edit")).toBe("SHT2");
    expect(extractDriveFileId("https://docs.google.com/presentation/d/SLD3/edit")).toBe("SLD3");
  });

  it("parses drive folder ids", () => {
    expect(extractDriveFileId("https://drive.google.com/drive/folders/FLD9")).toBe("FLD9");
    expect(extractDriveFileId("https://drive.google.com/drive/u/0/folders/FLD9?usp=drive_link")).toBe("FLD9");
  });

  it("returns null for unknown shapes", () => {
    expect(extractDriveFileId("https://example.com/file/d/abc")).toBeNull();
    expect(extractDriveFileId("not a url")).toBeNull();
  });
});
