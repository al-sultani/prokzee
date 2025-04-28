# Build stage
FROM --platform=$BUILDPLATFORM golang:1.22

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    nodejs \
    npm \
    pkg-config \
    libwebkit2gtk-4.0-dev \
    libgtk-3-dev \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Install wails
RUN go install github.com/wailsapp/wails/v2/cmd/wails@v2.9.2

# Set the working directory
WORKDIR /app

# Copy go mod, sum files and goproxy directory
COPY go.mod go.sum ./
COPY goproxy ./goproxy/

# Download Go dependencies
RUN go mod download

# Copy the frontend files
COPY frontend/package*.json frontend/

# Install frontend dependencies
WORKDIR /app/frontend
RUN npm install

# Copy the rest of the application
WORKDIR /app
COPY . .

# Create projects directory and initialize database
RUN mkdir -p /app/projects && \
    chmod 755 /app/projects && \
    sqlite3 /app/projects/default_project.db < /app/internal/projects/schema.sql && \
    chmod 644 /app/projects/default_project.db

# Build the application with CGO enabled
ENV CGO_ENABLED=1
RUN wails build

# Copy the built files to the mounted volume
CMD cp -r /app/build/* /app/build/ && \
    cp -r /app/projects/* /app/build/projects/ && \
    echo "Build completed. The binary and database are available in the build directory." 