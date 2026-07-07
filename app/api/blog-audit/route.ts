import { NextResponse } from "next/server";
import { auditBlogDraft, type BlogAuditInput } from "@/lib/blog-audit";
import { readBlogAuditFormPayload } from "@/lib/blog-upload";
import { rateLimitFromRequest } from "@/lib/seo/rate-limit";
import { getBrainState, saveBrainReport } from "@/lib/seo/service";
import { getTenantScopeFromRequest } from "@/lib/seo/tenant";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    rateLimitFromRequest(request, "blog-audit.list", 30, 60_000);
    return NextResponse.json(await getBrainState(getTenantScopeFromRequest(request)));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Br(AI)N audit state." },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    rateLimitFromRequest(request, "blog-audit", 6, 60_000);
    const { payload, sourceLabel, draftExcerpt } = await readPayload(request);
    const report = await auditBlogDraft(payload);
    const saved = await saveBrainReport(getTenantScopeFromRequest(request), {
      sourceLabel,
      draftExcerpt,
      report,
    });
    return NextResponse.json({ report, savedReport: saved.report, storageReady: saved.storageReady, storageError: saved.storageError });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to audit blog draft." },
      { status: 400 }
    );
  }
}

async function readPayload(request: Request): Promise<{ payload: BlogAuditInput; sourceLabel: string; draftExcerpt: string }> {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const payload = await readBlogAuditFormPayload(form);
    return {
      payload,
      sourceLabel: sourceLabelFromForm(form, payload),
      draftExcerpt: payload.content || "",
    };
  }

  const payload = (await request.json()) as BlogAuditInput;
  return {
    payload,
    sourceLabel: payload.title || inferDraftLabel(payload.content || "") || "Draft audit",
    draftExcerpt: payload.content || "",
  };
}

function sourceLabelFromForm(form: FormData, payload: BlogAuditInput) {
  const file = form.get("file");
  if (file && typeof file === "object" && "name" in file && typeof file.name === "string" && file.name) {
    return file.name;
  }

  return payload.title || inferDraftLabel(payload.content || "") || "Draft audit";
}

function inferDraftLabel(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) return "";
  return firstLine.replace(/^#+\s*/, "").slice(0, 72);
}
