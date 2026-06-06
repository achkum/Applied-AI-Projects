# 2-minute demo script (Loom)

A tight walkthrough for a recruiter or reviewer. Live app: https://ai-breastcancer-detector.vercel.app/

## Before recording
- Open the live app and let the backend warm up (first request after idle cold-starts in a few seconds).
- Have one preset slide in mind (the app ships 2 benign and 2 malignant).
- Optional: have a non-slide image ready (a photo) to show the input guard.

## Script

**0:00 - 0:20 / What it is**
"This is an AI decision support tool for breast histopathology. A pathologist uploads an H&E slide
and gets a benign or malignant prediction from a ResNet50 model, a Grad-CAM explanation, and a chat
assistant. It is a second read, not a diagnosis, and there is a disclaimer on every screen."

**0:20 - 0:50 / Predict**
- Click a malignant preset on the left.
- Point at the prediction card: class, confidence, and the triage tier.
- "The model returns a calibrated probability. Cases it is confident about are labelled benign or
  malignant. Cases near the threshold are flagged Needs review instead of being forced into a call."

**0:50 - 1:15 / Explain**
- Toggle the Grad-CAM view in the specimen viewer.
- "Grad-CAM highlights the tissue regions that drove the malignancy score, so the prediction is not
  a black box."

**1:15 - 1:40 / Ask the assistant**
- In the chat, ask: why did the model predict this, or which regions look suspicious.
- "The assistant is Gemini calling the same two tools the UI uses. Those tools are exposed over the
  Model Context Protocol, so they can plug into a wider CDSS or any MCP-aware agent, not just this UI."

**1:40 - 2:00 / Safety + engineering**
- Upload the non-slide photo to show the input guard rejecting it.
- "It refuses to predict on anything that is not a histopathology slide. Under the hood: FastAPI on
  Cloud Run, weights in GCS, a Next.js frontend on Vercel, and the model is an artifact from a
  patient-disjoint cross-validation pipeline."

## One-liners for the README or a CV
- End-to-end medical AI app: model serving, explainability, an MCP tool server, an agent, and cloud deploy.
- Out-of-distribution input guard so the closed-set classifier does not predict on non-slides.
- Three-way triage (benign / needs review / malignant) that surfaces low-confidence cases for a human.
