export type BlogToneProfile = {
  version: 1;
  status: "generated" | "manual";
  summary: string;
  traits: string[];
  do: string[];
  avoid: string[];
  evidenceStyle: string;
  structureStyle: string;
  vocabulary: string[];
  sampleCount: number;
  generatedAt: string | null;
  signals: {
    averageSentenceWords: number;
    sentenceCount: number;
    paragraphCount: number;
    headingCount: number;
    numberDensity: number;
    technicalTermDensity: number;
    hypeTermCount: number;
  };
};

type ToneProfileInput = {
  sampleText?: string;
  toneRules?: string[];
};

const TONE_TEXT_LIMIT = 80_000;
const TONE_STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "been",
  "being",
  "but",
  "can",
  "for",
  "from",
  "has",
  "have",
  "how",
  "into",
  "its",
  "more",
  "not",
  "our",
  "that",
  "the",
  "their",
  "then",
  "there",
  "this",
  "through",
  "use",
  "using",
  "was",
  "were",
  "what",
  "when",
  "where",
  "with",
  "you",
  "your",
]);

const TECHNICAL_TERMS = [
  "agent",
  "api",
  "benchmark",
  "cloud",
  "compute",
  "container",
  "cuda",
  "data",
  "deployment",
  "docker",
  "gpu",
  "gpus",
  "inference",
  "instance",
  "latency",
  "model",
  "node",
  "performance",
  "platform",
  "pricing",
  "runtime",
  "ssh",
  "token",
  "training",
  "workflow",
];

const HYPE_TERMS = ["revolutionary", "game-changing", "insane", "magic", "world-class", "unbeatable"];

export function generateBlogToneProfile({ sampleText = "", toneRules = [] }: ToneProfileInput): BlogToneProfile {
  const normalized = normalizeToneText(sampleText);
  const sentences = splitSentences(normalized);
  const words = normalized.toLowerCase().match(/[a-z][a-z0-9-']*/g) || [];
  const paragraphs = normalized.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const headingCount = (sampleText.match(/^#{1,4}\s+\S.+$/gm) || []).length;
  const numberCount = (normalized.match(/\b\d+(?:[.,]\d+)?%?\b/g) || []).length;
  const technicalTermCount = words.filter((word) => TECHNICAL_TERMS.includes(word)).length;
  const hypeTermCount = HYPE_TERMS.reduce((count, term) => count + countTerm(normalized, term), 0);
  const averageSentenceWords = sentences.length ? Math.round(words.length / sentences.length) : 0;
  const numberDensity = words.length ? roundSignal(numberCount / words.length) : 0;
  const technicalTermDensity = words.length ? roundSignal(technicalTermCount / words.length) : 0;
  const vocabulary = extractVocabulary(normalized, words);
  const sampleCount = inferSampleCount(sampleText, paragraphs);
  const traits = inferTraits({
    averageSentenceWords,
    headingCount,
    hypeTermCount,
    numberDensity,
    sampleText: normalized,
    technicalTermDensity,
  });
  const doRules = inferDoRules({
    averageSentenceWords,
    headingCount,
    numberDensity,
    technicalTermDensity,
    toneRules,
    vocabulary,
  });
  const avoidRules = inferAvoidRules({ averageSentenceWords, hypeTermCount, toneRules });
  const evidenceStyle =
    numberDensity > 0.015 || technicalTermDensity > 0.045
      ? "Use concrete technical proof, numbers, examples, or source-backed claims instead of broad assertions."
      : "Use clear source support for factual claims and keep unsupported claims qualified.";
  const structureStyle =
    headingCount || /\n[-*]\s+/.test(sampleText)
      ? "Keep sections scannable with short headings, compact paragraphs, and useful lists."
      : "Keep the argument linear and avoid over-structuring unless the draft needs a checklist.";

  return {
    version: 1,
    status: "generated",
    summary: summarizeTone(traits),
    traits,
    do: doRules,
    avoid: avoidRules,
    evidenceStyle,
    structureStyle,
    vocabulary,
    sampleCount,
    generatedAt: new Date().toISOString(),
    signals: {
      averageSentenceWords,
      sentenceCount: sentences.length,
      paragraphCount: paragraphs.length,
      headingCount,
      numberDensity,
      technicalTermDensity,
      hypeTermCount,
    },
  };
}

export function normalizeToneProfile(value: unknown): BlogToneProfile | null {
  const raw = typeof value === "string" && value.trim() ? parseJson(value) : value;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<BlogToneProfile>;
  const signals = row.signals && typeof row.signals === "object" ? row.signals : {};

  return {
    version: 1,
    status: row.status === "manual" ? "manual" : "generated",
    summary: normalizeToneText(row.summary).slice(0, 500),
    traits: normalizeStringList(row.traits, 8, 120),
    do: normalizeStringList(row.do, 8, 160),
    avoid: normalizeStringList(row.avoid, 8, 160),
    evidenceStyle: normalizeToneText(row.evidenceStyle).slice(0, 240),
    structureStyle: normalizeToneText(row.structureStyle).slice(0, 240),
    vocabulary: normalizeStringList(row.vocabulary, 12, 80),
    sampleCount: clampNumber(row.sampleCount, 0, 500),
    generatedAt: typeof row.generatedAt === "string" && row.generatedAt ? row.generatedAt : null,
    signals: {
      averageSentenceWords: clampNumber((signals as Partial<BlogToneProfile["signals"]>).averageSentenceWords, 0, 120),
      sentenceCount: clampNumber((signals as Partial<BlogToneProfile["signals"]>).sentenceCount, 0, 20_000),
      paragraphCount: clampNumber((signals as Partial<BlogToneProfile["signals"]>).paragraphCount, 0, 10_000),
      headingCount: clampNumber((signals as Partial<BlogToneProfile["signals"]>).headingCount, 0, 10_000),
      numberDensity: clampNumber((signals as Partial<BlogToneProfile["signals"]>).numberDensity, 0, 1),
      technicalTermDensity: clampNumber((signals as Partial<BlogToneProfile["signals"]>).technicalTermDensity, 0, 1),
      hypeTermCount: clampNumber((signals as Partial<BlogToneProfile["signals"]>).hypeTermCount, 0, 10_000),
    },
  };
}

export function toneProfileToContextText(profile: BlogToneProfile | null) {
  if (!profile) return "";
  return [
    `Tone profile summary: ${profile.summary}`,
    profile.traits.length ? `Tone traits: ${profile.traits.join("; ")}` : "",
    profile.do.length ? `Do: ${profile.do.join("; ")}` : "",
    profile.avoid.length ? `Avoid: ${profile.avoid.join("; ")}` : "",
    profile.evidenceStyle ? `Evidence style: ${profile.evidenceStyle}` : "",
    profile.structureStyle ? `Structure style: ${profile.structureStyle}` : "",
    profile.vocabulary.length ? `Preferred vocabulary: ${profile.vocabulary.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function toneProfileToRuleLines(profile: BlogToneProfile | null) {
  if (!profile) return [];
  return [
    ...profile.do.map((rule) => `Do: ${rule}`),
    ...profile.avoid.map((rule) => `Avoid: ${rule}`),
    profile.evidenceStyle ? `Evidence style: ${profile.evidenceStyle}` : "",
    profile.structureStyle ? `Structure style: ${profile.structureStyle}` : "",
  ].filter(Boolean);
}

function inferTraits({
  averageSentenceWords,
  headingCount,
  hypeTermCount,
  numberDensity,
  sampleText,
  technicalTermDensity,
}: {
  averageSentenceWords: number;
  headingCount: number;
  hypeTermCount: number;
  numberDensity: number;
  sampleText: string;
  technicalTermDensity: number;
}) {
  const traits = [
    averageSentenceWords <= 16
      ? "direct, concise sentence rhythm"
      : averageSentenceWords >= 28
        ? "long-form explanatory sentence rhythm"
        : "balanced explanatory sentence rhythm",
    technicalTermDensity > 0.045 ? "technical and implementation-aware" : "plain-language first",
    numberDensity > 0.015 ? "comfortable with numbers and concrete proof" : "qualifies claims without overloading numbers",
    headingCount ? "organized into scannable sections" : "linear editorial flow",
    /\byou\b|\byour\b/i.test(sampleText) ? "speaks directly to the reader" : "uses a neutral editorial voice",
    hypeTermCount ? "allows some high-energy wording" : "restrained and low-hype",
  ];

  return Array.from(new Set(traits)).slice(0, 6);
}

function inferDoRules({
  averageSentenceWords,
  headingCount,
  numberDensity,
  technicalTermDensity,
  toneRules,
  vocabulary,
}: {
  averageSentenceWords: number;
  headingCount: number;
  numberDensity: number;
  technicalTermDensity: number;
  toneRules: string[];
  vocabulary: string[];
}) {
  const rules = [
    averageSentenceWords <= 16
      ? "Keep sentences tight and easy to scan."
      : "Use enough explanation to make the logic clear.",
    technicalTermDensity > 0.045
      ? "Keep technical terms when they clarify the implementation."
      : "Translate technical ideas into plain reader value.",
    numberDensity > 0.015
      ? "Support factual claims with concrete numbers, dates, or examples."
      : "Qualify factual claims when a precise source is not attached.",
    headingCount ? "Use short section headers and compact paragraphs." : "Keep the argument moving in a simple sequence.",
    vocabulary.length ? `Prefer recurring client vocabulary such as ${vocabulary.slice(0, 5).join(", ")}.` : "",
    ...toneRules.slice(0, 3),
  ];

  return normalizeStringList(rules, 8, 160);
}

function inferAvoidRules({
  averageSentenceWords,
  hypeTermCount,
  toneRules,
}: {
  averageSentenceWords: number;
  hypeTermCount: number;
  toneRules: string[];
}) {
  const rules = [
    hypeTermCount ? "Do not add extra hype beyond what the approved samples use." : "Avoid hype words and unsupported superlatives.",
    averageSentenceWords <= 16 ? "Avoid long stacked sentences that bury the point." : "",
    "Avoid claims that sound definitive without evidence.",
    "Avoid changing product names, technical terms, or source meaning.",
    ...toneRules.filter((rule) => /\bavoid|never|no\b/i.test(rule)).slice(0, 3),
  ];

  return normalizeStringList(rules, 8, 160);
}

function summarizeTone(traits: string[]) {
  if (!traits.length) {
    return "Not enough sample text was supplied to infer a reliable tone.";
  }

  return `Approved samples read as ${traits.slice(0, 4).join(", ")}.`;
}

function extractVocabulary(text: string, words: string[]) {
  const brandedTerms = Array.from(new Set(text.match(/\b[A-Z][A-Za-z0-9().-]{2,}\b/g) || [])).slice(0, 8);
  const technicalTerms = TECHNICAL_TERMS.filter((term) => words.includes(term)).slice(0, 8);
  const counts = new Map<string, number>();

  for (const word of words) {
    if (word.length < 5 || TONE_STOP_WORDS.has(word) || TECHNICAL_TERMS.includes(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }

  const frequentTerms = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word)
    .slice(0, 6);

  return normalizeStringList([...brandedTerms, ...technicalTerms, ...frequentTerms], 12, 80);
}

function splitSentences(text: string) {
  return text
    .replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1\n")
    .split(/\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 20);
}

function inferSampleCount(rawText: string, paragraphs: string[]) {
  const separated = rawText
    .split(/\n\s*-{3,}\s*\n/g)
    .map((section) => section.trim())
    .filter((section) => section.length > 80);

  if (separated.length > 1) {
    return separated.length;
  }

  return paragraphs.length ? 1 : 0;
}

function normalizeToneText(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/\0/g, " ")
        .slice(0, TONE_TEXT_LIMIT)
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : "";
}

function normalizeStringList(value: unknown, limit: number, itemLimit: number) {
  const rows = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n|,/) : [];
  return Array.from(
    new Set(
      rows
        .map((item) => normalizeToneText(String(item || "")).slice(0, itemLimit))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

function countTerm(text: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\-/g, "[- ]");
  return (text.match(new RegExp(`\\b${escaped}\\b`, "gi")) || []).length;
}

function roundSignal(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clampNumber(value: unknown, min: number, max: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.min(max, Math.max(min, number));
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
