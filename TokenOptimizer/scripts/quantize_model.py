"""Download LLMLingua-2 and quantize it to int8 ONNX (~178 MB) for the compression service.

    python scripts/quantize_model.py --out .models/llmlingua2-bert

The artifact belongs in GCS (like the BreastCancer .pth), not git. Verified: 709.7 MB fp32 ->
178.2 MB int8, compression quality preserved.
"""

import argparse


def main() -> int:
    parser = argparse.ArgumentParser(description="Download + int8-quantize LLMLingua-2 for serving.")
    parser.add_argument("--out", default=".models/llmlingua2-bert", help="output model directory")
    args = parser.parse_args()

    from app.compress.llmlingua import download_and_quantize

    dst = download_and_quantize(args.out)
    print(f"Wrote {dst}. Upload it (+ the tokenizer files) to your model bucket for the service.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
