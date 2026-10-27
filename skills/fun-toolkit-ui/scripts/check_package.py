#!/usr/bin/env python3
"""Read-only identity, local-reference and exact manifest verification. Python 3.9+."""
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


class Resources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        key = 'src' if tag in ('script', 'img', 'source') else 'href' if tag in ('link', 'a') else None
        if key and values.get(key):
            self.links.append(values[key])


def inspect(root):
    errors = []
    files = [p for p in root.rglob('*') if p.is_file()]
    for path in root.rglob('*'):
        if path.is_symlink():
            errors.append(f'Symbolic link: {path.relative_to(root)}')
    required = ['SKILL.md', 'funskill.json', 'governance.json', 'asset-manifest.json',
                'assets/tool-page-starter/index.html', 'assets/tool-page-starter/upload-surface.css',
                'assets/tool-page-starter/upload-paste.js',
                'assets/tool-page-starter/feedback-motion.css',
                'assets/tool-page-starter/feedback-motion.js', 'references/acceptance.md']
    errors.extend(f'Missing: {name}' for name in required if not (root / name).is_file())
    try:
        meta = json.loads((root / 'funskill.json').read_text(encoding='utf-8'))
        entry = (root / 'SKILL.md').read_text(encoding='utf-8')
        if root.name != meta['slug'] or not re.search(r'^name: ' + re.escape(meta['slug']) + r'$', entry, re.M):
            errors.append('Directory, slug and frontmatter name differ.')
        manifest = json.loads((root / 'asset-manifest.json').read_text(encoding='utf-8'))
        listed = set()
        for record in manifest['files']:
            name = record['path']
            relative = Path(name)
            if relative.is_absolute() or '..' in relative.parts:
                errors.append('Unsafe manifest path.')
                continue
            listed.add(name)
            path = root / name
            if not path.is_file():
                errors.append(f'Missing or changed: {name}')
                continue
            data = path.read_bytes()
            if hashlib.sha256(data).hexdigest() == record['sha256']:
                continue
            # FunSkill rewrites metadata key order/spacing on download. Compare
            # parsed values for this one file; all other resources stay byte-exact.
            if name == 'funskill.json' and record.get('semanticSha256'):
                try:
                    normalized = json.dumps(json.loads(data), sort_keys=True,
                                            ensure_ascii=False, separators=(',', ':')).encode('utf-8')
                    if hashlib.sha256(normalized).hexdigest() == record['semanticSha256']:
                        continue
                except (ValueError, UnicodeError):
                    pass
            errors.append(f'Missing or changed: {name}')
        actual = {p.relative_to(root).as_posix() for p in files if p.name != 'asset-manifest.json'}
        if listed != actual:
            errors.append('Manifest inventory differs from actual files.')
    except (OSError, ValueError, KeyError) as error:
        errors.append(f'Metadata or manifest: {error}')
    for path in files:
        if path.suffix not in ('.html', '.md', '.css'):
            continue
        content = path.read_text(encoding='utf-8')
        if path.suffix == '.html':
            parser = Resources()
            parser.feed(content)
            links = parser.links
        elif path.suffix == '.md':
            links = re.findall(r'\]\(([^)]+)\)', content)
        else:
            links = re.findall(r'url\([\s\'"]*([^\)\'"\s]+)', content)
        for link in links:
            url = urlsplit(link)
            if url.scheme or url.netloc or not url.path:
                continue
            target = (path.parent / unquote(url.path)).resolve()
            if root.resolve() not in target.parents or not target.exists():
                errors.append(f'Broken/escaping reference in {path.relative_to(root)}: {link}')
    svg_count = len(list((root / 'assets/tool-page-starter/assets/feedback').glob('*.svg')))
    if svg_count != 8:
        errors.append(f'Expected 8 feedback SVGs, found {svg_count}.')
    return {'ok': not errors, 'files': len(files), 'feedbackSVGs': svg_count, 'errors': errors,
            'notice': 'Integrity checks do not verify rendered UI or real business behavior.'}


if __name__ == '__main__':
    result = inspect(Path(__file__).resolve().parent.parent)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result['ok'] else 1)
