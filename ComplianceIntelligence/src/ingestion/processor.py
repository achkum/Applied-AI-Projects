import hashlib
import os
from typing import List, Dict
import pypdf
import pytesseract
from PIL import Image
import io

class DocumentProcessor:
    def __init__(self, use_ocr: bool = True):
        self.use_ocr = use_ocr

    def process(self, file_path: str) -> Dict:
        """Process a PDF and return text and metadata."""
        filename = os.path.basename(file_path)
        with open(file_path, "rb") as f:
            content = f.read()
            content_hash = hashlib.sha256(content).hexdigest()
        
        text = self._extract_text(file_path)
        
        return {
            "filename": filename,
            "content_hash": content_hash,
            "text": text
        }

    def _extract_text(self, file_path: str) -> str:
        text = ""
        # Try normal PDF extraction first
        try:
            with open(file_path, "rb") as f:
                reader = pypdf.PdfReader(f)
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            print(f"Standard extraction failed: {e}")

        # If text is empty and OCR is enabled, try OCR
        if not text.strip() and self.use_ocr:
            print("Standard extraction yielded no text. Falling back to OCR...")
            text = self._perform_ocr(file_path)
            
        return text

    def _perform_ocr(self, file_path: str) -> str:
        # Simplified OCR logic using Tesseract
        # In a real system, we'd convert PDF pages to images first
        # For now, this is a placeholder for the OCR flow
        return "OCR-extracted content placeholder"

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """Split text into overlapping chunks."""
        chunks = []
        for i in range(0, len(text), chunk_size - overlap):
            chunks.append(text[i : i + chunk_size])
        return chunks
