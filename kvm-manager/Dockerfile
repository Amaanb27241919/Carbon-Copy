# QEMU/KVM manager — needs Ubuntu base for qemu-system-x86_64
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install QEMU for host architecture (x86 on Linux, arm on macOS/ARM)
RUN apt-get update && apt-get install -y \
    qemu-utils \
    wget \
    curl \
    ca-certificates \
    && ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "amd64" ]; then apt-get install -y qemu-system-x86_64 qemu-kvm ovmf; \
       elif [ "$ARCH" = "arm64" ]; then apt-get install -y qemu-system-arm; \
       fi \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

# VM disk images stored here (mounted as Docker volume)
RUN mkdir -p /var/lib/carbon-vms

EXPOSE 3007

CMD ["node", "src/index.js"]
