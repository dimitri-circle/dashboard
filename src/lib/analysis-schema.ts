export const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "marketRead",
    "matrix",
    "crowdedClaims",
    "opportunities",
    "reportDraft"
  ],
  properties: {
    executiveSummary: { type: "string" },
    marketRead: { type: "string" },
    matrix: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "competitor",
          "positioning",
          "targetCustomer",
          "keyFeatures",
          "pricingSignals",
          "proofPoints",
          "sourceUrls"
        ],
        properties: {
          competitor: { type: "string" },
          positioning: { type: "string" },
          targetCustomer: { type: "string" },
          keyFeatures: { type: "array", items: { type: "string" } },
          pricingSignals: { type: "string" },
          proofPoints: { type: "array", items: { type: "string" } },
          sourceUrls: { type: "array", items: { type: "string" } }
        }
      }
    },
    crowdedClaims: { type: "array", items: { type: "string" } },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reasoning", "supportingSources", "confidence"],
        properties: {
          title: { type: "string" },
          reasoning: { type: "string" },
          supportingSources: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["low", "medium", "high"] }
        }
      }
    },
    reportDraft: {
      type: "object",
      additionalProperties: false,
      required: ["title", "sections"],
      properties: {
        title: { type: "string" },
        sections: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["heading", "body", "sourceUrls"],
            properties: {
              heading: { type: "string" },
              body: { type: "string" },
              sourceUrls: { type: "array", items: { type: "string" } }
            }
          }
        }
      }
    }
  }
} as const;
