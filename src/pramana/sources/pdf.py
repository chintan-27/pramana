"""PDF download and text extraction using PyMuPDF."""

from pathlib import Path

import httpx
import pymupdf

from pramana.config import Settings


def download_pdf(url: str, filename: str, settings: Settings) -> Path | None:
    """Download a PDF from a URL and save to the PDF directory."""
    if not url:
        return None

    settings.pdf_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = settings.pdf_dir / filename

    if pdf_path.exists():
        return pdf_path

    try:
        response = httpx.get(url, timeout=60.0, follow_redirects=True)
        response.raise_for_status()

        # Verify it's actually a PDF
        if not response.content[:5] == b"%PDF-":
            return None

        pdf_path.write_bytes(response.content)
        return pdf_path
    except (httpx.HTTPError, OSError):
        return None


def extract_text(pdf_path: Path) -> str:
    """Extract text from a PDF file using PyMuPDF."""
    try:
        doc = pymupdf.open(str(pdf_path))
        text_parts = []
        for page_num, page in enumerate(doc, 1):
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(f"[Page {page_num}]\n{page_text}")
        doc.close()
        return "\n\n".join(text_parts)
    except Exception:
        return ""


def extract_text_from_bytes(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes without saving to disk."""
    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        text_parts = []
        for page_num, page in enumerate(doc, 1):
            page_text = page.get_text()
            if page_text.strip():
                text_parts.append(f"[Page {page_num}]\n{page_text}")
        doc.close()
        return "\n\n".join(text_parts)
    except Exception:
        return ""
