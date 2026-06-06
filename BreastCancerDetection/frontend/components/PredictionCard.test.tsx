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
  expect(screen.getByText(/Confident benign/)).toBeInTheDocument();
});

test("confidence is exposed to assistive tech as a numeric value", () => {
  render(<PredictionCard result={benign} />);
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "82");
});

const uncertain: ClassificationResult = {
  class: "benign",
  confidence: 0.53,
  probability_malignant: 0.47,
  tier: "uncertain_review",
  prediction_id: "xyz",
};

test("uncertain tier renders as a distinct review state, not a benign/malignant call", () => {
  render(<PredictionCard result={uncertain} />);
  expect(screen.getByText("Uncertain")).toBeInTheDocument();
  expect(screen.getByText(/pathologist review/i)).toBeInTheDocument();
  // No confidence bar — we don't present a class confidence for the uncertain band.
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
});
