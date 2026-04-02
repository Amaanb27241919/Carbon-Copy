# QEMU/KVM manager — needs Ubuntu base for qemu-system-x86_64
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    qemu-system-x86_64 \
    qemu-utils \
    qemu-kvm \
    wget \
    curl \
    ovmf \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY src ./src

# VM disk images stored here (mounted as Docker volume)
RUN mkdir -p /var/lib/carbon-vms

EXPOSE 3007

CMD ["node", "src/index.js"]
