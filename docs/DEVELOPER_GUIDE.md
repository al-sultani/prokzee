# 👨‍💻 ProKZee Developer Guide

Welcome to the **ProKZee** developer documentation! This guide will help you understand the project architecture, set up your development environment, and start contributing effectively.

---

## 📚 Table of Contents

- [🧱 Architecture Overview](#architecture-overview)
- [🛠️ Development Setup](#development-setup)
- [📁 Project Structure](#project-structure)
- [🏗️ Building](#building)
- [🧪 Testing](#testing)
- [🤝 Contributing](#contributing)
- [🔌 Plugin Development](#plugin-development)

---

## 🧱 Architecture Overview

ProKZee is built with modern, cross-platform technologies:

- 🌐 **Frontend**: React + TypeScript  
- ⚙️ **Backend**: Go  
- 🖥️ **Cross-platform UI**: [Wails](https://wails.io/)  
- 💾 **Database**: SQLite

### 🔩 Key Components

```
ProKZee
├── Frontend (React)
│   ├── Proxy Interceptor
│   ├── Request/Response Editor
│   ├── History Viewer
│   └── Analysis Tools
├── Backend (Go)
│   ├── Proxy Server
│   ├── Certificate Manager
│   ├── Database
│   └── Plugin System
└── Core Services
    ├── Traffic Interception
    ├── Request Processing
    └── Security Analysis
```

---

## 🛠️ Development Setup

### ✅ Prerequisites

Make sure you have the following installed:

- 🐹 Go 1.21+
- 🟢 Node.js 18+
- 📦 npm or yarn
- 🛠️ Wails CLI
- 🔗 Git

### 🚀 Installation Steps

1. Clone the repo:
```bash
git clone https://github.com/al-sultani/prokzee.git
cd prokzee
```

2. Install Wails CLI (if not already installed):
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

3. Install frontend dependencies:
```bash
cd frontend
npm install
```

4. Install backend dependencies:
```bash
go mod download
```

---

### 🧪 Development Environment

Run the full-stack development environment:

```bash
wails dev
```

Or, for frontend-only development:

```bash
cd frontend
npm run dev
```

---

## 📁 Project Structure

```
prokzee/
├── frontend/                 # React frontend code
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── features/        # Feature-specific views
│   │   ├── contexts/        # React context providers
│   │   ├── hooks/           # Custom React hooks
│   │   └── styles/          # CSS & styling
├── internal/                # Go internal packages
├── build/                   # Build artifacts
└── wails.json               # Wails project config
```

---

## 🏗️ Building

### 🧪 Development Build

```bash
wails dev
```

### 🚀 Production Build

```bash
wails build
```

You can also target specific platforms:

- 🪟 Windows:  
  ```bash
  wails build -platform windows/amd64
  ```

- 🍎 macOS:  
  ```bash
  wails build -platform darwin/universal
  ```

- 🐧 Linux:  
  ```bash
  wails build -platform linux/amd64
  ```

---

## 🧪 Testing

🧪 *Coming soon!* Unit tests and integration tests are being integrated into the CI pipeline.

---

## 🤝 Contributing

We welcome contributions! 🚀  
To contribute:

1. Fork the repo and clone your fork
2. Create a new branch for your feature or fix
3. Follow existing code style conventions
4. Submit a pull request (PR)

Please see `CONTRIBUTING.md` (coming soon) for detailed guidelines.

---

## 🔌 Plugin Development

Plugin support is currently **Work in Progress** ⚠️  
Soon you’ll be able to:

- Extend the core with custom tools
- Add request/response processors
- Inject UI panels
- Register analysis engines

Stay tuned for documentation and APIs!

---

Thanks for helping improve **ProKZee**! 💙  
For questions, feel free to reach out via [GitHub Discussions](https://github.com/al-sultani/prokzee/discussions) or [Discord](https://discord.gg/prokzee).
