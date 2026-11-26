FROM node:20

# Install dependencies for Chromaprint, ffmpeg, and yt-dlp (external song search/fetch)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libchromaprint1 \
    libchromaprint-tools \
    python3 \
    curl \
    && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify fpcalc and yt-dlp are installed and working
RUN which fpcalc && fpcalc -version && yt-dlp --version

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
