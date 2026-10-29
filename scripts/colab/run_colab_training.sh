#!/usr/bin/env bash
# ==============================================================================
# EME Decision Fabric: Automated Remote GPU Training Launcher
# Uses official google-colab-cli to provision GPU, upload datasets, train,
# download checkpoints, and guarantee session termination.
# ==============================================================================
set -euo pipefail

SESSION_ID="eme-train-$(date +%s)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

DATA_DIR="$ROOT_DIR/src/decision-fabric/data"
OUT_DIR="$ROOT_DIR/src/decision-fabric/artifacts/eme-decision-v1"
LOG_DIR="$ROOT_DIR/src/decision-fabric/reports"

GPU_TYPE="${GPU_TYPE:-T4}" # T4, L4, or A100

echo "======================================================================"
echo "EME Decision Fabric — Remote Colab GPU Training Launcher"
echo "Session:     $SESSION_ID"
echo "Target GPU:  $GPU_TYPE"
echo "Train Data:  $DATA_DIR/train.jsonl"
echo "Val Data:    $DATA_DIR/validation.jsonl"
echo "Output:      $OUT_DIR"
echo "======================================================================"

if ! command -v colab &> /dev/null; then
    echo "ERROR: google-colab-cli ('colab') is not installed or not in PATH."
    echo "Install via: uv tool install google-colab-cli   or   pip install google-colab-cli"
    exit 1
fi

cleanup() {
    echo ""
    echo "==> Teardown: Stopping Colab remote session $SESSION_ID..."
    colab stop -s "$SESSION_ID" 2>/dev/null || true
    echo "==> Session stopped. Compute units preserved."
}
trap cleanup EXIT INT TERM

echo "==> Step 1: Provisioning Colab GPU runtime ($GPU_TYPE)..."
colab new -s "$SESSION_ID" --gpu "$GPU_TYPE"

echo "==> Step 2: Uploading dependencies and datasets..."
colab upload -s "$SESSION_ID" "$SCRIPT_DIR/requirements-colab.txt" /content/requirements-colab.txt
colab upload -s "$SESSION_ID" "$SCRIPT_DIR/train_eme_decision.py" /content/train_eme_decision.py
colab upload -s "$SESSION_ID" "$DATA_DIR/train.jsonl" /content/train.jsonl
colab upload -s "$SESSION_ID" "$DATA_DIR/validation.jsonl" /content/validation.jsonl

echo "==> Step 3: Installing remote dependencies..."
echo '!pip install -q -r /content/requirements-colab.txt' | colab exec -s "$SESSION_ID" --timeout 600

echo "==> Step 4: Executing remote training pipeline..."
mkdir -p "$LOG_DIR"
echo '!python3 /content/train_eme_decision.py --data /content/train.jsonl --eval /content/validation.jsonl --out /content/checkpoints/eme-decision-v1' | colab exec -s "$SESSION_ID" --timeout 3600 | tee "$LOG_DIR/colab_training_stream.log"

echo "==> Step 5: Downloading trained checkpoint and manifest..."
mkdir -p "$OUT_DIR"
colab download -s "$SESSION_ID" /content/checkpoints/eme-decision-v1 "$OUT_DIR"

echo "==> Training successfully completed and artifacts retrieved!"
