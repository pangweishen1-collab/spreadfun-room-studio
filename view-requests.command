#!/bin/zsh
cd "$(dirname "$0")" || exit 1
python3 server.py --list-requests
printf '\n%s\n' 'Press Enter to close.'
read -r
