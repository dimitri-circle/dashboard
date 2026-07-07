import JSZip from "jszip";
import { cleanExtractedText, type BlogAuditFormat, type BlogAuditInput } from "./blog-audit";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_FILES = 20;
const MAX_EXTRACTED_CHARS = 120_000;

const SUPPORTED_EXTENSIONS = new Set([".md", ".markdown", ".mdx", ".txt", ".html", ".htm", ".csv", ".docx"]);

type UploadedDraft = {
  title?: string;
  format: BlogAuditFormat;
  content: string;
};

export async function readBlogAuditFormPayload(form: FormData): Promise<BlogAuditInput> {
  const file = form.get("file");
  const pastedContent = asString(form.get("content"));
  const context = readContextPayload(form);

  if (isUpload(file) && file.size > 0) {
    const uploaded = await readUploadedDraft(file);
    return {
      title: uploaded.title,
      format: uploaded.format,
      content: uploaded.content,
      ...context,
    };
  }

  return {
    format: "plain_text",
    content: pastedContent,
    ...context,
  };
}

function readContextPayload(form: FormData) {
  return {
    clientName: asString(form.get("clientName")),
    clientContext: asString(form.get("clientContext")),
    approvedSources: parseList(form.get("approvedSources")),
    forbiddenClaims: parseList(form.get("forbiddenClaims")),
    toneRules: parseList(form.get("toneRules")),
    toneProfile: parseJson(form.get("toneProfile")),
  };
}

async function readUploadedDraft(file: File): Promise<UploadedDraft> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Uploaded file must be 10 MB or smaller.");
  }

  const name = file.name || "Uploaded draft";
  const lowerName = name.toLowerCase();

  if (lowerName.endsWith(".zip")) {
    return readZipDraft(file);
  }

  if (lowerName.endsWith(".docx")) {
    const content = await extractDocxText(await file.arrayBuffer());
    return { title: stripExtension(name), format: "plain_text", content };
  }

  const format = inferFormat(name, file.type);
  const rawText = await file.text();
  return {
    title: stripExtension(name),
    format,
    content: cleanExtractedText(rawText, contentTypeFor(format), format),
  };
}

async function readZipDraft(file: File): Promise<UploadedDraft> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .filter((entry) => !entry.name.startsWith("__MACOSX/"))
    .filter((entry) => !entry.name.split("/").some((part) => part.startsWith(".")))
    .filter((entry) => SUPPORTED_EXTENSIONS.has(extensionOf(entry.name)))
    .sort((a, b) => filePriority(a.name) - filePriority(b.name) || a.name.localeCompare(b.name))
    .slice(0, MAX_ZIP_FILES);

  if (!entries.length) {
    throw new Error("ZIP must include a Markdown, text, HTML, CSV, MDX, or DOCX draft file.");
  }

  const sections: string[] = [];
  let remaining = MAX_EXTRACTED_CHARS;

  for (const entry of entries) {
    if (remaining <= 0) break;

    const text = await readZipEntryText(entry);
    if (!text) continue;

    const section = [`Source file: ${entry.name}`, text].join("\n\n").slice(0, remaining);
    sections.push(section);
    remaining -= section.length;
  }

  if (!sections.length) {
    throw new Error("ZIP did not contain readable draft text.");
  }

  return {
    title: stripExtension(file.name),
    format: "plain_text",
    content: sections.join("\n\n---\n\n"),
  };
}

async function readZipEntryText(entry: JSZip.JSZipObject) {
  const extension = extensionOf(entry.name);

  if (extension === ".docx") {
    return extractDocxText(await entry.async("arraybuffer"));
  }

  const format = inferFormat(entry.name);
  const rawText = await entry.async("string");
  return cleanExtractedText(rawText, contentTypeFor(format), format);
}

async function extractDocxText(buffer: ArrayBuffer) {
  const docx = await JSZip.loadAsync(buffer);
  const documentXml = docx.file("word/document.xml");

  if (!documentXml) {
    throw new Error("DOCX file does not contain a readable document body.");
  }

  const xml = await documentXml.async("string");
  const withParagraphs = xml
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:tab\s*\/>/g, "\t")
    .replace(/<w:br\s*\/>/g, "\n");

  return decodeXmlEntities(withParagraphs.replace(/<[^>]+>/g, " "));
}

function inferFormat(fileName: string, contentType = ""): BlogAuditFormat {
  const extension = extensionOf(fileName);

  if (extension === ".html" || extension === ".htm" || /html/i.test(contentType)) return "html";
  if (extension === ".md" || extension === ".markdown" || extension === ".mdx") return "markdown";
  return "plain_text";
}

function contentTypeFor(format: BlogAuditFormat) {
  if (format === "html") return "text/html";
  if (format === "markdown") return "text/markdown";
  return "text/plain";
}

function filePriority(fileName: string) {
  const extension = extensionOf(fileName);
  if (extension === ".md" || extension === ".markdown" || extension === ".mdx") return 0;
  if (extension === ".docx") return 1;
  if (extension === ".txt") return 2;
  if (extension === ".html" || extension === ".htm") return 3;
  return 4;
}

function extensionOf(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[^.\\/]+$/);
  return match?.[0] || "";
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[^.\\/]+$/, "");
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function isUpload(value: FormDataEntryValue | null): value is File {
  return Boolean(value && typeof value === "object" && "arrayBuffer" in value && "size" in value);
}

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseList(value: FormDataEntryValue | null) {
  return asString(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJson(value: FormDataEntryValue | null) {
  const text = asString(value);
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
