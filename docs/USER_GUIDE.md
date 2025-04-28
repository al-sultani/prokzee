# 🛡️ ProKZee User Guide

**ProKZee** is a powerful web security testing tool that helps you intercept, analyze, and modify HTTP/HTTPS traffic in real-time. This guide walks you through getting started and using its core features effectively.

---

## 📚 Table of Contents

- [⚙️ Installation](#installation)
- [🚀 Getting Started](#getting-started)
- [🔍 Features](#features)
  - [🧰 Proxy Interceptor](#proxy-interceptor)
  - [🕸️ HTTP History](#http-history)
  - [🧾 Interception Rules](#interception-rules)
  - [📤 Request Resender](#request-resender)
  - [🎯 Fuzzer](#fuzzer)
  - [🧠 LLM Analyzer](#llm-analyzer)
  - [📡 Listener](#listener)
  - [🔒 Scope Management](#scope-management)
  - [🗺️ Site Map](#site-map)
  - [🔌 Plugins](#plugins)
- [🛠️ Troubleshooting](#troubleshooting)
- [⬆️ Updates](#updates)
- [💾 Data Management](#data-management)
- [🔐 Privacy and Security](#privacy-and-security)
- [📄 License](#license)

---

## ⚙️ Installation

1. Download the latest release for your platform from the [Releases Page](https://github.com/al-sultani/prokzee/releases).
2. Follow the installation instructions based on your OS:

   - 🪟 **Windows**: Run the `.msi` installer. Then, launch the `.exe` file by selecting `Run as administrator`  
   - 🍎 **macOS**: Open the `.dmg` and drag ProKZee to **Applications**  
   - 🐧 **Linux**: Use your package manager:
     ```bash
     # For Debian/Ubuntu
     sudo dpkg -i prokzee_*.deb
     ```

---

## 🚀 Getting Started

### 🔧 Initial Setup

1. Launch **ProKZee**
2. Configure your browser to use ProKZee as a proxy:
   - **Host**: `127.0.0.1`
   - **Port**: `8080` (default; can be customized)
   - **Protocol**: HTTP/HTTPS

### 🔐 SSL Certificate Installation

1. Open `http://prokzee/` after launching the app
2. Click **"Download Certificate"** and follow instructions:
   - 🪟 **Windows**: Installed automatically
   - 🍎 **macOS**: Open in **Keychain Access** and mark it trusted
   - 🐧 **Linux**: Follow your distro's certificate guide
3. Restart your browser to apply the certificate

---

## 🔍 Features

### 🧰 Proxy Interceptor

Control and modify traffic in real time:

- ✅ Toggle interception
- ✏️ Edit headers, parameters, and body
- 🔁 Forward or 🚫 drop requests
- 📤 Send requests to Resender, Fuzzer, or LLM Analyzer
- 🔍 Filter and search efficiently

---

### 🕸️ HTTP History

View and analyze intercepted requests:

- 📄 Full request/response view
- 🔎 Advanced filters
- 📤 Export capabilities
- 📆 Timeline of requests
- 🧠 Response analysis tools

---

### 🧾 Interception Rules

Two types of rules help you manage traffic:

1. 🧲 **Capture/Ignore Rules** – Decide if requests should be intercepted or ignored  
2. ✂️ **Match and Replace Rules** – Modify request/response content dynamically

**To create a rule:**

1. Go to **Rules** tab  
2. Click **"New Rule"**  
3. Configure conditions:
   - 🔗 URL patterns  
   - ⚙️ HTTP methods  
   - 🏷️ Header matchers  
   - 🧬 Body content matchers  
4. (Optional) Define match/replace logic

---

### 📤 Request Resender

Manually test request variations:

- 📝 Edit and resend requests
- 💾 Save as templates
- 🔍 Search request and response content

---

### 🎯 Fuzzer

Fuzz endpoints for vulnerabilities:

1. Pick a request  
2. 🖱️ Right-click to insert fuzz points  
3. Choose payloads:
   - 📚 Built-in lists
   - 🧾 Custom wordlists
4. 🔄 Start, pause, and resume fuzzing

---

### 🧠 LLM Analyzer

Leverage AI (ChatGPT 4.5) for smarter testing:

- 🧩 Pattern-based insights
- 🔐 Security recommendations
- 🧪 (Coming soon) Custom prompts 

---

### 📡 Listener

Client for [Interactsh](https://github.com/projectdiscovery/interactsh) – **not** for raw traffic monitoring.

- 📬 Receive out-of-band (OOB) interactions
- 🔗 Link callbacks to payloads
- 📄 Log DNS/HTTP responses
- 🧩 Build custom response handlers
- 👁️ Monitor OOB activity in real time

---

### 🔒 Scope Management

Keep testing targeted:

- 📌 Define regex-based scope filters
- 🛑 Block traffic outside defined scope

---

### 🗺️ Site Map

Visualize the target structure:

- 🧱 Group paths by domain and folder
- 👁️ Interactive site exploration

---

### 🔌 Plugins

Extend ProKZee with custom plugins (🚧 WIP):

- ⚙️ Integrate custom tools
- 🔄 Add response processors
- 📈 Build custom analysis modules
- 🧩 Extend UI and API

---

### ⚙️ Settings 

Configure ProKZee to match your needs:

- 📝 **Project Settings**
  - Rename your project for better organization
  - Customize proxy port (default: 8080)
  - Set project-specific scope rules

- 🤖 **AI Integration**
  - Configure ChatGPT API endpoint
  - Securely store your API key
  - Test connection and validate setup

- 🌐 **Interactsh Configuration**
  - Set custom Interactsh server host
  - Configure port settings
  - Enable/disable OOB detection features

- 🎨 **Appearance**
  - Toggle between Dark and Light themes
  - Customize UI element sizes
  - Adjust font settings for better readability

---

## 🛠️ Troubleshooting

### 🔐 Certificate Issues

- Reinstall and ensure it's trusted
- Check browser security settings
- Restart the browser

### 🔌 Connection Issues

- Double-check proxy settings
- Confirm ProKZee is running
- Make sure port 8080 is not blocked

### 🖥️ UI/Performance Issues

- 🧹 UI glitch? Go to **ProKZee → Refresh** from the top menu

---

## ⬆️ Updates

> 🔄 Auto-update is on the roadmap!

---

## 💾 Data Management

Project data is stored locally:

- 🪟 `%APPDATA%\ProKZee\projects\`
- 🍎 `~/Library/Application Support/ProKZee/projects/`
- 🐧 `~/.local/share/ProKZee/projects/`

---

## 🔐 Privacy and Security

- 🔒 All data is processed **locally**
- 🚫 No data is sent to external servers

