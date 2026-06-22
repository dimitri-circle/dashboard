import { NextResponse } from "next/server";
import { auditBlogDraft, type BlogAuditInput } from "@/lib/blog-audit";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "blog-audit", 6, 60_000);
    const payload = await readPayload(request);
    const report = await auditBlogDraft(payload);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to audit blog draft." },
      { status: 400 }
    );
  }
}

async function readPayload(request: Request): Promise<BlogAuditInput> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    const fileContent =
      file && typeof file === "object" && "text" in file ? await (file as { text: () => Promise<string> }).text() : "";

    return {
      title: asString(form.get("title")),
      format: asString(form.get("format")) || (fileContent ? "plain_text" : undefined),
      content: fileContent || asString(form.get("content")),
      url: asString(form.get("url")),
    };
  }

  return (await request.json()) as BlogAuditInput;
}

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
