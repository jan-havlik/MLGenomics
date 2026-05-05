"""
Registry of supported genomes and the chromosomes we expose.

UCSC goldenPath FASTAs live at:
  https://hgdownload.soe.ucsc.edu/goldenPath/{ucsc_name}/chromosomes/{chrom}.fa.gz

The cache layout on disk mirrors this:
  {feature_cache_dir}/{ucsc_name}/{chrom}.parquet
"""
from __future__ import annotations

from typing import NamedTuple


class GenomeInfo(NamedTuple):
    ucsc_name: str          # used in URL and cache path
    display_name: str       # shown in UI
    species: str
    chromosomes: list[str]  # whitelist of chromosomes we expose


_HUMAN_AUTOSOMES = [f"chr{i}" for i in range(1, 23)] + ["chrX", "chrY"]
_MOUSE_AUTOSOMES = [f"chr{i}" for i in range(1, 20)] + ["chrX", "chrY"]


GENOMES: dict[str, GenomeInfo] = {
    "hg38": GenomeInfo(
        ucsc_name="hg38",
        display_name="Human (hg38)",
        species="Homo sapiens",
        chromosomes=_HUMAN_AUTOSOMES,
    ),
    "hs1": GenomeInfo(
        ucsc_name="hs1",
        display_name="Human T2T-CHM13 (hs1)",
        species="Homo sapiens",
        chromosomes=_HUMAN_AUTOSOMES,
    ),
    "mm39": GenomeInfo(
        ucsc_name="mm39",
        display_name="Mouse (mm39)",
        species="Mus musculus",
        chromosomes=_MOUSE_AUTOSOMES,
    ),
}

DEFAULT_GENOME = "hg38"


def is_valid(genome: str, chromosome: str) -> bool:
    info = GENOMES.get(genome)
    return info is not None and chromosome in info.chromosomes


def ucsc_fasta_url(genome: str, chromosome: str) -> str:
    info = GENOMES[genome]
    return (
        f"https://hgdownload.soe.ucsc.edu/goldenPath/"
        f"{info.ucsc_name}/chromosomes/{chromosome}.fa.gz"
    )
