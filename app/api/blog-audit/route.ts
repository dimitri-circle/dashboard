import { NextResponse } from "next/server";
import { auditBlogDraft, type BlogAuditInput } from "@/lib/blog-audit";
import { readBlogAuditFormPayload } from "@/lib/blog-upload";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";

export const runtime = "nodejs";

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
    return readBlogAuditFormPayload(form);
  }

  return (await request.json()) as BlogAuditInput;
}
