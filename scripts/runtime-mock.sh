#!/bin/sh
set -eu

mode="${1:-normal}"

case "$mode" in
  normal)
    IFS= read -r input
    printf '%s\n' '{"type":"run.started","runId":"mock-native"}'
    printf '{"type":"output.delta","text":"%s"}\n' "$input"
    printf '%s\n' '{"type":"usage","inputTokens":1,"outputTokens":1}'
    printf '{"type":"run.completed","result":"%s"}\n' "$input"
    ;;
  slow-output)
    printf '%s\n' '{"type":"run.started","runId":"mock-slow"}'
    printf '%s\n' '{"type":"output.delta","text":"one"}'
    sleep 0.05
    printf '%s\n' '{"type":"output.delta","text":"two"}'
    sleep 0.05
    printf '%s\n' '{"type":"run.completed","result":"onetwo"}'
    ;;
  malformed)
    printf '%s\n' '{"type":"run.started","runId":"mock-malformed"}'
    printf '%s\n' 'this is not json'
    printf '%s\n' '{"type":"run.completed","result":"Recovered."}'
    ;;
  hang-with-child)
    sleep 30 &
    child_pid=$!
    printf '%s\n' "$child_pid" > child.pid
    wait "$child_pid"
    ;;
  *)
    printf 'unknown mock mode: %s\n' "$mode" >&2
    exit 2
    ;;
esac
