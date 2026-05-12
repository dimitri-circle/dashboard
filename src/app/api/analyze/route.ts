import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { AnalysisRequest, CompetitiveAnalysis } from "@/app/types";
import { analysisSchema } from "@/lib/analysis-schema";
import { collectEvidence } from "@/lib/source-fetch";

export const runtime = "nodejs";

let openaiClient: OpenAI | null = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  return openaiClient;
}

function validateInput(value: unknown): AnalysisRequest {
  const input = value as Partial<AnalysisRequest>;
  const competitors = Array.isArray(input.competitors)
    ? input.competitors.filter((competitor) => competitor?.url?.trim()).slice(0, 5)
    : [];

  if (!input.companyName?.trim()) {
    throw new Error("Company name is required");
  }

  if (!input.companyUrl?.trim()) {
    throw new Error("Company URL is required");
  }

  if (competitors.length < 1) {
    throw new Error("Add at least one competitor URL");
  }

  return {
    companyName: input.companyName.trim(),
    companyUrl: input.companyUrl.trim(),
    category: input.category?.trim() || "Unspecified category",
    targetCustomer: input.targetCustomer?.trim() || "Unspecified target customer",
    reportGoal: input.reportGoal?.trim() || "Identify competitive positioning gaps",
    competitors: competitors.map((competitor) => ({
      name: competitor.name?.trim() || competitor.url.trim(),
      url: competitor.url.trim()
    }))
  };
}

function buildPrompt(input: AnalysisRequest, evidence: Awaited<ReturnType<typeof collectEvidence>>) {
  return `You are a reliability-focused competitive analyst.

Goal:
Produce a useful first-pass competitive analysis for startups and agencies.

Rules:
- Use only the provided evidence.
- If evidence is missing, say the claim is uncertain.
- Do not invent pricing, customers, features, or proof points.
- Every major claim must include sourceUrls from the evidence.
- Keep recommendations specific and operational.

Research brief:
Company: ${input.companyName}
Company URL: ${input.companyUrl}
Category: ${input.category}
Target customer: ${input.targetCustomer}
Report goal: ${input.reportGoal}

Evidence:
${evidence
  .map(
    (source) => `---
Name: ${source.name}
URL: ${source.url}
Type: ${source.pageType}
Status: ${source.status}
Title: ${source.title}
Error: ${source.error || "none"}
Text:
${source.textPreview || "[No text available]"}`
  )
  .join("\n\n")}
`;
}

export async function POST(request: Request) {
  try {
    const input = validateInput(await request.json());
    const evidence = await collectEvidence(input);
    const client = getOpenAIClient();

    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5-mini",
      input: buildPrompt(input, evidence),
      text: {
        format: {
          type: "json_schema",
          name: "competitive_analysis",
          schema: analysisSchema,
          strict: true
        }
      }
    });

    const output = response.output_text;
    if (!output) {
      throw new Error("The model returned no text output");
    }

    const analysis = JSON.parse(output) as Omit<CompetitiveAnalysis, "evidence">;

    return NextResponse.json({
      ...analysis,
      evidence
    } satisfies CompetitiveAnalysis);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown analysis error"
      },
      { status: 400 }
    );
  }
}
