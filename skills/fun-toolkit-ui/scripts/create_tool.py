#!/usr/bin/env python3
"""Copy the complete offline starter into a new directory; never overwrite."""
import argparse
from pathlib import Path
import shutil
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path, help='A new, non-existing tool directory')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    source = root / 'assets' / 'tool-page-starter'
    destination = args.destination.expanduser().absolute()
    if destination.exists() or destination.is_symlink():
        parser.error('Destination already exists; choose a new path. Nothing was overwritten.')
    if root == destination.resolve() or root in destination.resolve().parents:
        parser.error('Create the tool outside the Skill directory.')
    if not (source / 'index.html').is_file():
        parser.error('The full starter is missing; extract the complete Skill ZIP.')
    if any(path.is_symlink() for path in source.rglob('*')):
        parser.error('Unexpected symbolic link in starter; verify the original package.')
    try:
        shutil.copytree(source, destination)
    except OSError as error:
        print(f'Copy failed: {error}. Inspect the new destination before retrying.', file=sys.stderr)
        return 1
    print(f'Created: {destination}')
    print('Open index.html or serve this directory locally. Generation is a clearly marked demo;')
    print('replace it with real processing before delivering a production tool.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
