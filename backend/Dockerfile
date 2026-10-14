
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Runtime library required by CPU-based numerical packages.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy the existing application dependency manifests.
COPY requirements.txt requirements-queue.txt ./

# Install CPU-only PyTorch explicitly, then constrain the remaining
# dependency installation so pip does not replace it with a CUDA build.
RUN python -m pip install --upgrade pip \
    && python -m pip install \
       --index-url https://download.pytorch.org/whl/cpu \
       "torch==2.14.1+cpu" \
    && printf 'torch==2.14.1+cpu\n' > /tmp/torch-constraints.txt \
    && python -m pip install \
       --constraint /tmp/torch-constraints.txt \
       -r requirements.txt \
       -r requirements-queue.txt \
    && python -m pip check \
    && python -c "import torch; print('PyTorch:', torch.__version__); print('CUDA build:', torch.version.cuda); assert torch.version.cuda is None, 'Expected CPU-only PyTorch'"

# Copy backend code, migrations, and supporting files.
COPY . .

EXPOSE 10000

CMD ["python", "docker_entrypoint.py"]
