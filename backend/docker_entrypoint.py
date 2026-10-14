"""Run the Evalyn API and RQ worker in one prototype container."""

from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time


def stop_process(process: subprocess.Popen | None) -> None:
    """Stop a child process and force termination if necessary."""
    if process is None or process.poll() is not None:
        return

    process.terminate()

    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main() -> int:
    env = os.environ.copy()

    redis_url = (
        env.get("EVALYN_REDIS_URL")
        or env.get("REDIS_URL")
        or "redis://127.0.0.1:6379/0"
    ).strip()

    if not redis_url:
        raise RuntimeError("The Redis URL must not be empty.")

    # Keep generation, scoring, and the worker on the same Redis database.
    env["EVALYN_REDIS_URL"] = redis_url
    env["REDIS_URL"] = redis_url

    port = env.get("PORT", "10000")

    # RQ provides a console executable; python -m rq is unsupported.
    rq_executable = shutil.which("rq")

    if rq_executable is None:
        raise RuntimeError(
            "The RQ executable was not found. "
            "Ensure the RQ dependency is installed in the Docker image."
        )

    worker: subprocess.Popen | None = None
    api: subprocess.Popen | None = None
    shutdown_requested = False

    def request_shutdown(signum: int, frame: object) -> None:
        nonlocal shutdown_requested
        shutdown_requested = True

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)

    try:
        worker = subprocess.Popen(
            [
                rq_executable,
                "worker",
                "-u",
                redis_url,
                "assessment-generation",
            ],
            env=env,
        )

        api = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "app.main:app",
                "--host",
                "0.0.0.0",
                "--port",
                port,
            ],
            env=env,
        )

        print(
            f"Evalyn API and RQ worker launched; HTTP port={port}",
            flush=True,
        )

        while not shutdown_requested:
            worker_status = worker.poll()
            api_status = api.poll()

            if worker_status is not None:
                print(
                    f"RQ worker exited with status {worker_status}.",
                    flush=True,
                )
                return worker_status if worker_status != 0 else 1

            if api_status is not None:
                print(
                    f"FastAPI exited with status {api_status}.",
                    flush=True,
                )
                return api_status if api_status != 0 else 1

            time.sleep(1)

        return 0

    finally:
        stop_process(api)
        stop_process(worker)


if __name__ == "__main__":
    raise SystemExit(main())