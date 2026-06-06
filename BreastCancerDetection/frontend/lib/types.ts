export type ClassName = "benign" | "malignant";

export type TriageTier = "confident_benign" | "uncertain_review" | "confident_malignant";

export type ClassificationResult = {
  class: ClassName;
  confidence: number;
  probability_malignant: number;
  tier: TriageTier;
  prediction_id: string;
};

export type HeatmapResult = {
  heatmap_base64: string;
  attention_summary: string;
  prediction_id: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};
