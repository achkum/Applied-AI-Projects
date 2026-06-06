import { render, screen } from "@testing-library/react";

import type { ClassificationResult } from "@/lib/types";

import { PredictionCard } from "./PredictionCard";

const benign: ClassificationResult = {
  class: "benign",
  confidence: 0.82,
  probability_malignant: 0.18,
  tier: "confident_benign",
  prediction_id: "abc",
};

test("renders class, numeric confidence and tier", () => {
  render(<PredictionCard result={benign} />);
  expect(screen.getByText("Benign")).toBeInTheDocument();
  expect(screen.getByText("82%")).toBeInTheDocument();
  expect(screen.getByText(/Confident · Benign/)).toBeInTheDocument();
});

test("confidence is exposed to assistive tech as a numeric value", () => {
  render(<PredictionCard result={benign} />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "82");
});
