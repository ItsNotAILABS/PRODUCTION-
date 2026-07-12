#!/usr/bin/env bash
# Check health of all services and show status
# Usage: ./check-health.sh [--watch]

set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
WATCH_MODE=false

if [[ "${1:-}" == "--watch" ]]; then
  WATCH_MODE=true
fi

check_health() {
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "Weekly Command Center — Service Health Check"
  echo "Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Check API liveness
  if ! curl -s -f "$API_URL/health" > /dev/null 2>&1; then
    echo "❌ Core API not responding at $API_URL"
    echo "   Ensure run_local.sh is running or docker-compose up is active"
    return 1
  fi
  echo "✅ Core API: responding"

  # Get system health
  if health_json=$(curl -s -f "$API_URL/health/system" 2>/dev/null); then
    status=$(echo "$health_json" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    message=$(echo "$health_json" | grep -o '"message":"[^"]*"' | cut -d'"' -f4)

    case "$status" in
      healthy)
        echo "✅ System Status: HEALTHY"
        ;;
      degraded)
        echo "⚠️  System Status: DEGRADED"
        ;;
      critical)
        echo "❌ System Status: CRITICAL"
        ;;
    esac
    echo "   $message"

    # Parse service details
    echo ""
    echo "Service Status:"
    echo "$health_json" | grep -o '"name":"[^"]*"' | while read -r line; do
      name=$(echo "$line" | cut -d'"' -f4)
      echo "   • $name"
    done

    # Show which services are using fallbacks
    if echo "$health_json" | grep -q '"engine":"python-fallback"'; then
      echo ""
      echo "ℹ️  Python fallbacks in use:"
      echo "$health_json" | grep -B2 '"engine":"python-fallback"' | grep '"name"' | while read -r line; do
        name=$(echo "$line" | cut -d'"' -f4)
        echo "   • $name using Python implementation"
      done
    fi

  else
    echo "⚠️  Could not get system health details"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

if [[ "$WATCH_MODE" == true ]]; then
  while true; do
    clear
    check_health || true
    echo ""
    echo "Refreshing in 5 seconds (press Ctrl+C to stop)..."
    sleep 5
  done
else
  check_health
fi
