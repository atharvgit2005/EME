#!/usr/bin/env python3
"""
Editing Mechanics Engine (EME) - Isolated Earshot Sound Kit Bridge (Stage 26.2)

Provides an out-of-process JSON IPC interface for:
- querying kit presets
- planning takes
- rendering takes into isolated staging directories with physical transient measurement
"""

import sys
import os
import json
import traceback

def safe_json_default(obj):
    import numpy as np
    if isinstance(obj, (np.floating, float)):
        return float(obj)
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    return str(obj)

def handle_command(cmd):
    action = cmd.get("action")

    try:
        from earshot.forge import kit
    except Exception as e:
        return {"ok": False, "error": f"Failed to import earshot: {e}"}

    try:
        if action == "presets":
            return {"ok": True, "presets": kit.presets()}

        elif action == "preset":
            name = cmd.get("name")
            if not name:
                return {"ok": False, "error": "Missing preset name"}
            k = kit.preset(name)
            return {"ok": True, "kit": k}

        elif action == "plan":
            k = cmd.get("kit")
            if not k:
                return {"ok": False, "error": "Missing kit definition"}
            takes = kit.plan(k)
            return {"ok": True, "takes": takes}

        elif action == "render":
            k = cmd.get("kit")
            out_dir = cmd.get("outDir")
            force = bool(cmd.get("force", False))

            if not k or not out_dir:
                return {"ok": False, "error": "Missing kit definition or outDir"}

            os.makedirs(out_dir, exist_ok=True)
            real_out = os.path.realpath(out_dir)

            lock = kit.render(k, real_out, force=force)
            return {"ok": True, "lock": lock, "outDir": real_out}

        else:
            return {"ok": False, "error": f"Unknown action: {action}"}

    except Exception as err:
        return {
            "ok": False,
            "error": str(err),
            "traceback": traceback.format_exc()
        }

def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            cmd = json.loads(line)
            res = handle_command(cmd)
        except Exception as e:
            res = {"ok": False, "error": f"JSON parse or dispatch error: {e}"}

        out = json.dumps(res, default=safe_json_default)
        sys.stdout.write(out + "\n")
        sys.stdout.flush()

if __name__ == "__main__":
    main()
