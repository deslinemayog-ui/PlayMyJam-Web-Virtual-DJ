FROM node:20

# Install dependencies for Chromaprint, ffmpeg, Deno (yt-dlp JS runtime), and official bundled yt-dlp executable
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libchromaprint1 \
    libchromaprint-tools \
    python3 \
    curl \
    unzip \
    && ARCH="$(uname -m)" \
    && if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then YTDLP_BIN_NAME="yt-dlp_linux_aarch64"; else YTDLP_BIN_NAME="yt-dlp_linux"; fi \
    && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${YTDLP_BIN_NAME}" -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh -s -- -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify fpcalc, yt-dlp, and deno are installed and working
RUN which fpcalc && fpcalc -version && yt-dlp --version && deno --version

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
COPY package*.json ./

RUN npm install

# Bundle app source
COPY . .

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 8080

# Set environment variable for port (Cloud Run uses 8080)
ENV PORT=8080

# Start the application
CMD [ "node", "index.js" ]
