export type CompetitorInput = {
  name: string;
  url: string;
};

export type AnalysisRequest = {
  companyName: string;
  companyUrl: string;
  category: string;
  targetCustomer: string;
  reportGoal: string;
  competitors: CompetitorInput[];
};

export type EvidenceSource = {
  name: string;
  url: string;
  title: string;
  pageType: "company" | "competitor";
  status: "fetched" | "failed";
  textPreview: string;
  error?: string;
};

export type MatrixRow = {
  competitor: string;
  positioning: string;
  targetCustomer: string;
  keyFeatures: string[];
  pricingSignals: string;
  proofPoints: string[];
  sourceUrls: string[];
};

export type Opportunity = {
  title: string;
  reasoning: string;
  supportingSources: string[];
  confidence: "low" | "medium" | "high";
};

export type CompetitiveAnalysis = {
  executiveSummary: string;
  marketRead: string;
  matrix: MatrixRow[];
  crowdedClaims: string[];
  opportunities: Opportunity[];
  reportDraft: {
    title: string;
    sections: Array<{
      heading: string;
      body: string;
      sourceUrls: string[];
    }>;
  };
  evidence: EvidenceSource[];
};
