"""Pramana CLI — Typer-based command-line interface."""

from typing import Annotated, Optional

import typer
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn

from pramana import __version__
from pramana.config import get_settings

app = typer.Typer(
    name="pramana",
    help="A hypothesis-driven research assistant for scientific literature analysis.",
    no_args_is_help=True,
)
console = Console()


def version_callback(value: bool) -> None:
    if value:
        console.print(f"pramana {__version__}")
        raise typer.Exit()


@app.callback()
def main(
    version: Annotated[
        Optional[bool],
        typer.Option("--version", "-v", callback=version_callback, is_eager=True),
    ] = None,
) -> None:
    """Pramana — hypothesis-driven research assistant."""


@app.command()
def analyze(
    hypothesis: Annotated[str, typer.Argument(help="The research hypothesis to analyze")],
    initiation_type: Annotated[
        str,
        typer.Option(
            "--type", "-t",
            help="Research initiation type: new, related, continuation, or joining",
        ),
    ] = "new",
    max_papers: Annotated[
        int,
        typer.Option("--max-papers", "-n", help="Maximum number of papers to retrieve"),
    ] = 50,
    output_format: Annotated[
        str,
        typer.Option("--format", "-f", help="Output format: markdown, json"),
    ] = "markdown",
) -> None:
    """Analyze scientific literature based on a research hypothesis."""
    settings = get_settings()
    settings.ensure_dirs()

    valid_types = {"new", "related", "continuation", "joining", "verify"}
    if initiation_type not in valid_types:
        console.print(f"[red]Error:[/red] Invalid initiation type '{initiation_type}'.")
        console.print(f"Valid types: {', '.join(sorted(valid_types))}")
        raise typer.Exit(1)

    console.print(Panel(
        f"[bold]{hypothesis}[/bold]\n\nType: {initiation_type} | Max papers: {max_papers}",
        title="Pramana Analysis",
        border_style="blue",
    ))

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        console=console,
    ) as progress:
        # Phase 1: Parse hypothesis
        task = progress.add_task("Parsing hypothesis...", total=None)
        from pramana.pipeline.hypothesis import parse_hypothesis
        parsed = parse_hypothesis(hypothesis, initiation_type, settings)
        progress.update(task, description="[green]Hypothesis parsed[/green]")
        progress.remove_task(task)

        # Phase 2: Build corpus
        task = progress.add_task("Retrieving papers...", total=None)
        from pramana.pipeline.corpus import build_corpus
        corpus = build_corpus(parsed, max_papers=max_papers, settings=settings)
        paper_count = len(corpus.papers)
        progress.update(task, description=f"[green]Retrieved {paper_count} papers[/green]")
        progress.remove_task(task)

        # Phase 3: Screen papers
        task = progress.add_task("Screening papers...", total=None)
        from pramana.pipeline.screening import screen_corpus
        corpus = screen_corpus(corpus, parsed, settings)
        screened = sum(1 for p in corpus.papers if p.get("screened_out"))
        passed = paper_count - screened
        progress.update(task, description=f"[green]{passed} papers passed screening[/green]")
        progress.remove_task(task)

        # Phase 4: Extract evidence
        task = progress.add_task("Extracting evidence...", total=None)
        from pramana.pipeline.extraction import extract_all_evidence
        evidence = extract_all_evidence(corpus, parsed, settings)
        progress.update(
            task,
            description=f"[green]Extracted {len(evidence)} facts[/green]",
        )
        progress.remove_task(task)

        # Phase 5: Normalize
        task = progress.add_task("Normalizing evidence...", total=None)
        from pramana.pipeline.normalization import normalize_evidence
        normalized = normalize_evidence(evidence, settings)
        progress.update(task, description="[green]Evidence normalized[/green]")
        progress.remove_task(task)

        # Phase 6: Run lenses via orchestrator
        task = progress.add_task("Running analysis...", total=None)
        from pramana.pipeline.orchestrator import run_analysis
        results = run_analysis(corpus, normalized, parsed, settings)
        progress.update(task, description="[green]Analysis complete[/green]")
        progress.remove_task(task)

        # Phase 7: Generate report
        task = progress.add_task("Generating report...", total=None)
        from pramana.report.generator import generate_report
        report = generate_report(results, parsed, output_format, settings)
        progress.update(task, description="[green]Report generated[/green]")
        progress.remove_task(task)

    console.print()
    console.print(report)


@app.command()
def venues(
    domain: Annotated[
        str,
        typer.Option("--domain", "-d", help="Filter by domain"),
    ] = "bme",
) -> None:
    """List known research venues for a domain."""
    from pramana.models.database import get_session
    from pramana.models.schema import Venue

    with get_session() as session:
        query = session.query(Venue)
        if domain:
            query = query.filter(Venue.domain.contains(domain))
        venues_list = query.all()

    if not venues_list:
        console.print("[yellow]No venues found.[/yellow]")
        return

    from rich.table import Table
    table = Table(title=f"Venues — {domain}")
    table.add_column("Name")
    table.add_column("Type")
    table.add_column("Domain")
    table.add_column("Tier")

    for v in venues_list:
        table.add_row(v.name, v.venue_type, v.domain, v.tier)

    console.print(table)
