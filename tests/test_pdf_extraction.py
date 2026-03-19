"""Tests for multimodal PDF extraction (table/figure caption detection)."""

from pramana.sources.pdf import _extract_captions


def test_extract_table_captions():
    text = "Some text\nTable 1: Patient demographics\nMore text\nTable 2. Results summary\n"
    captions = _extract_captions(text)
    assert len(captions) == 2
    assert "Table 1: Patient demographics" in captions[0]
    assert "Table 2. Results summary" in captions[1]


def test_extract_figure_captions():
    text = "Figure 1: Architecture overview\nSome text\nFig. 2: ROC curves\n"
    captions = _extract_captions(text)
    assert len(captions) == 2
    assert "Figure 1: Architecture overview" in captions[0]
    assert "Fig. 2: ROC curves" in captions[1]


def test_extract_mixed_captions():
    text = "Table 1: Data\nFigure 3: Model\nNo caption here\n"
    captions = _extract_captions(text)
    assert len(captions) == 2


def test_no_captions():
    text = "This is just regular text without any tables or figures."
    captions = _extract_captions(text)
    assert captions == []
