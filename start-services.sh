#!/bin/bash

# Milaidy development server management script
# Uses the built-in dev script which starts both API (31337) and UI (2138)

PID_FILE="/tmp/milaidy-dev.pid"
LOG_FILE="/tmp/milaidy-dev.log"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

cd "$PROJECT_ROOT" || exit 1

check_port() {
    local port=$1
    if lsof -ti:$port >/dev/null 2>&1; then
        return 0  # port in use
    else
        return 1  # port free
    fi
}

kill_port() {
    local port=$1
    echo "Killing processes on port $port..."
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
    sleep 1
}

start() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" >/dev/null 2>&1; then
            echo "Milaidy dev server already running (PID: $pid)"
            return 0
        fi
    fi

    # Kill any zombie processes on both ports
    if check_port 31337; then
        kill_port 31337
    fi
    if check_port 2138; then
        kill_port 2138
    fi

    echo "Starting Milaidy dev server..."
    echo "  API:  http://localhost:31337"
    echo "  UI:   http://localhost:2138"
    
    cd "$PROJECT_ROOT"
    nohup bun run dev > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo ""
    echo "Started (PID: $(cat "$PID_FILE"))"
    echo "Log: $LOG_FILE"
    echo ""
    echo "Waiting for services to start..."
    sleep 5
    
    # Check if it's actually running
    if ps -p $(cat "$PID_FILE") >/dev/null 2>&1; then
        echo "✅ Services running"
    else
        echo "❌ Failed to start - check log: tail -100 $LOG_FILE"
        rm -f "$PID_FILE"
        return 1
    fi
}

stop() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" >/dev/null 2>&1; then
            echo "Stopping Milaidy dev server (PID: $pid)..."
            kill "$pid" 2>/dev/null || true
            sleep 2
            # Force kill if still running
            if ps -p "$pid" >/dev/null 2>&1; then
                kill -9 "$pid" 2>/dev/null || true
            fi
        fi
        rm -f "$PID_FILE"
    fi
    
    # Cleanup any lingering processes
    if check_port 31337; then
        kill_port 31337
    fi
    if check_port 2138; then
        kill_port 2138
    fi
    
    echo "Services stopped"
}

status() {
    echo "=== Milaidy Dev Server Status ==="
    
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" >/dev/null 2>&1; then
            echo "✅ Running (PID: $pid)"
            echo ""
            echo "Ports:"
            echo "  API:  31337"
            echo "  UI:   2138"
            echo ""
            echo "Access: http://localhost:2138"
        else
            echo "❌ Not running (stale PID file)"
            rm -f "$PID_FILE"
        fi
    else
        echo "❌ Not running"
    fi
    
    echo ""
    echo "Log: $LOG_FILE"
    echo ""
    echo "Port status:"
    if check_port 31337; then
        echo "  31337: IN USE"
    else
        echo "  31337: free"
    fi
    if check_port 2138; then
        echo "  2138: IN USE"
    else
        echo "  2138: free"
    fi
}

case "${1:-status}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        echo "Restarting..."
        stop
        sleep 1
        start
        ;;
    status)
        status
        ;;
    logs)
        tail -100 "$LOG_FILE"
        ;;
    logs:follow)
        tail -f "$LOG_FILE"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs|logs:follow}"
        exit 1
        ;;
esac
