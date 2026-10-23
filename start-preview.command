#!/bin/zsh
cd "$(dirname "$0")" || exit 1
printf '%s\n' 'Fun Toolkit' 'Open http://127.0.0.1:8765/index.html in your browser.' 'Press Control-C to stop the preview.'
exec python3 server.py --host 127.0.0.1 --port 8765
