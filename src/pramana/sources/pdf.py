"""PDF download and text extraction using PyMuPDF."""

import re
from pathlib import Path

import httpx
import pymupdf

from pramana.config import Settings

# Patterns for table/figure captions
_TABLE_PATTERN = re.compile(
    r"(Table\s+\d+[\.:]\s*.+?)(?:\n|$)", re.IGNORECASE
)
_FIGURE_PATTERN = re.compile(
    r"(Fig(?:ure)?\.?\s+\d+[\.:]\s*.+?)(?:\n|$)", re.IGNORECASE
)


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


def _extract_page(page: pymupdf.Page, page_num: int) -> str:
    """Extract text from a single page with table/figure annotations."""
    page_text = page.get_text()
    if not page_text.strip():
        return ""

    parts = [f"[Page {page_num}]"]

    # Detect images on the page
    images = page.get_images(full=True)
    if images:
        parts.append(f"[{len(images)} image(s) on this page]")

    parts.append(page_text)

    # Extract table/figure captions
    captions = _extract_captions(page_text)
    if captions:
        parts.append("\n[Detected captions on this page:]")
        for cap in captions:
            parts.append(f"  - {cap}")

    return "\n".join(parts)


def _extract_captions(text: str) -> list[str]:
    """Extract table and figure captions from text."""
    captions: list[str] = []
    for match in _TABLE_PATTERN.finditer(text):
        captions.append(match.group(1).strip())
    for match in _FIGURE_PATTERN.finditer(text):
        captions.append(match.group(1).strip())
    return captions


def extract_text(pdf_path: Path) -> str:
    """Extract text from a PDF file using PyMuPDF."""
    try:
        doc = pymupdf.open(str(pdf_path))
        text_parts = []
        for page_num, page in enumerate(doc, 1):
            page_text = _extract_page(page, page_num)
            if page_text:
                text_parts.append(page_text)
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
            page_text = _extract_page(page, page_num)
            if page_text:
                text_parts.append(page_text)
        doc.close()
        return "\n\n".join(text_parts)
    except Exception:
        return ""
