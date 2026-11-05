# Enefit Web Platform & Digital Services Suite (INSYS THWS)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-viktorbuild-2496ED?style=flat-square&logo=docker&logoColor=white)](https://hub.docker.com/u/viktorbuild)
[![YouTube Walkthrough](https://img.shields.io/badge/YouTube-Portal%20Walkthrough-FF0000?style=flat-square&logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=9KbtOWYTjr8)
[![Node.js](https://img.shields.io/badge/Runtime-Node.js%20%7C%20Express-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-MongoDB%20%7C%20Shared%20Valeri-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![LLM Orchestration](https://img.shields.io/badge/AI-Azure%20OpenAI%20(GPT--4.1)-0078D4?style=flat-square&logo=microsoftazure&logoColor=white)](https://azure.microsoft.com/)
[![Standard Compliance](https://img.shields.io/badge/Standard-DIN%20EN%2017463%3A2021%20%2F%20A1%3A2024-orange?style=flat-square)](https://www.din.de/)
[![Research Institute](https://img.shields.io/badge/Institute-INSYS%20THWS-003366?style=flat-square)](https://www.thws.de/en/research/institutes/insys/)

<p align="center">
  <a href="https://www.youtube.com/watch?v=9KbtOWYTjr8" target="_blank">
    <img src="https://img.youtube.com/vi/9KbtOWYTjr8/maxresdefault.jpg" alt="Enefit Portal Overview & Digital AI Tools for SMEs" width="750" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
  </a>
  <br>
  <strong>▶️ <a href="https://www.youtube.com/watch?v=9KbtOWYTjr8" target="_blank">Click here to watch the official portal overview & AI tools demonstration on YouTube</a></strong>
  <br>
  <em>Official walkthrough: AI tools, VALERI energy evaluation engine, Legal Radar, and enterprise services for SMEs | enefit.ai</em>
</p>

---

> [!IMPORTANT]
> **Academic Review & Data Protection Notice:**  
> This repository is an official **sanitized public copy** prepared specifically for Master's Degree Admissions and academic examination committees. Continuous development on the original production repository has been actively ongoing since **early 2024** at the Institute for Energy and Systems ([THWS INSYS](https://www.thws.de/en/research/institutes/insys/)).  
> In compliance with European Data Protection regulations (EU GDPR / DSGVO) and institutional guidelines, all operational secrets, production API keys, and actual registered SME contact records have been decoupled and replaced with environment templates (`.env.example`) and synthetic evaluation fixtures.  
> Full multi-year Git history, production deployment logs, and institutional recommendations can be discussed and verified upon request: **[kakhno.viktor@gmail.com](mailto:kakhno.viktor@gmail.com)**.

---

Full-stack production platform and suite of intelligent digital services developed for **[Enefit](https://www.enefit.ai/)** at the **Institute for Energy and Systems (INSYS)**, Technical University of Applied Sciences Würzburg-Schweinfurt ([THWS INSYS](https://www.thws.de/en/research/institutes/insys/)).

As the **Lead Developer for Digital Services**, I architected and implemented the core application layer, automated compliance systems, enterprise financial assessment engines, and AI microservices powering the platform.

---

## 🚀 Key Digital Services Architected & Built

### 1. VALERI Engine (DIN EN 17463:2021 & A1:2024 Compliance)
*Directory: `VALERI NEW/` & Core Routes in `server.js`*
- **Standard-Compliant Financial Modeling:** Engineered the full 11-step assessment workflow for energy-related investments (ERI) according to German/European standard **DIN EN 17463:2021** (VALERI standard) and amendment **A1:2024**.
- **Mathematical Simulation (`engine/math.js`):** Implemented net present value (NPV), Weighted Average Cost of Capital (WACC), dynamic annual energy price escalation rate ($epr$), general price inflation ($pr$), salvage values ($R_T$), and cash flow discounting over investment horizon $T$.
- **Automated Sensitivity & Scenario Analysis:** Generates multi-variable risk matrices and computes automated Worst-Case, Base-Case, and Best-Case boundaries.
- **Generative AI Copilot (`ai/gemini.js` / Azure OpenAI GPT-4.1):** Created structured prompting pipelines that analyze natural-language technical descriptions to automatically predict energy flow impacts, suggest WACC baseline rates, evaluate qualitative benefits, and compose executive decision proposals.
- **Steganographic Watermarking:** Integrated zero-width Unicode steganography (`applyWatermark` using `\u200B` and `\u200C`) for AI governance, verifying which report segments were synthesized by the AI assistant.

### 2. Legal Radar (Autonomous Regulatory Scanner & Digest Engine)
*Directory: `legal_radar/`*
- **Regulatory Web & RSS Crawlers:** Built background crawlers monitoring German Federal Law Gazettes (*Bundesgesetzblatt / recht.bund.de*), *gesetze-im-internet.de*, and the European Union Publications Office (OP1/OP2).
- **Automated Document Ingestion:** Downloads official legal gazettes and extracts text directly from embedded PDF documents via `pdf-parse` and `cheerio`.
- **Azure OpenAI Law Classification:** Evaluates each legal amendment using Azure OpenAI `gpt-4.1-nano`, categorizing regulations by target industry (manufacturing, renewable energy, chemicals, logistics) and generating concise impact summaries.
- **Targeted Notification Service (`mailer.js`):** Dispatches automated, personalized HTML email digests via Nodemailer/SMTP to company executives based on their subscribed industry focus areas.
- **Persistence Layer (`db.js`):** Multi-collection MongoDB database (`radar_laws`, `radar_subscribers`, `radar_settings`) with indexing and deduplication.

### 3. Multi-Query Concept & Retrieval Booster
*Directory: `multi-query-concept/`*
- **Semantic Query Expansion:** Implemented a query expansion service that analyzes ambiguous user inquiries and synthesizes 5 distinct high-precision variations tailored to energy auditing standards (e.g., *Industrie 4.0, CO2-Reduktionsstrategien, Energieaudits, Energieeinsparung*).
- **LightRAG Proxy:** Queries the distributed LightRAG Graph backend on `https://viktor.thws.education/query` with rewritten queries to ensure maximum document recall.

### 4. Förderfinder (Grant & Subsidy Discovery Navigator)
*Pages: `forderfinder-info.html`, `forderfinderEnglishScheme.png`, `forderfinderGermanScheme.png`*
- Decision tree and navigational system guiding German SMEs through federal (BAFA, KfW) and Bavarian state funding opportunities for decarbonization and energy-efficiency modernization.

### 5. News Aggregator & Custom RSS Feeds
*Pages: `news.html`, `news-info.html`*
- Microservices designed for scraping and parsing regional chamber of commerce news (IHK Würzburg-Schweinfurt).
- Containerized and published on Docker Hub:
  - [`viktorbuild/news-parser`](https://hub.docker.com/u/viktorbuild)
  - [`viktorbuild/rss-generator-ihkwurzburg`](https://hub.docker.com/u/viktorbuild)
  - [`viktorbuild/flowise-monitor`](https://hub.docker.com/u/viktorbuild)

### 6. Enterprise Onboarding & Administration Architecture
*Core: `server.js`, `dashboard.html`, `company-registration.html`, `admin-login.html`*
- Company application and registration workflow with dual review steps.
- Role-based session management (`admin` vs `company`).
- Real-time NDJSON stream proxying for AI chatbot interactions (`/api/lightrag-query`).

---

## 🏛 System Architecture

```mermaid
flowchart TD
    User["SME Client / Company User"] -->|HTTPS| WebApp["Node.js / Express Server\n(Port 3000)"]
    Admin["INSYS Admin / Auditor"] -->|Auth & Review| WebApp

    subgraph Service Ecosystem ["Enefit Digital Services Suite (Built by Viktor)"]
        WebApp --> VALERI["VALERI Module\n(DIN EN 17463 / A1:2024 Engine)"]
        WebApp --> Radar["Legal Radar\n(Regulatory RSS & PDF Scanner)"]
        WebApp --> MultiQ["Multi-Query Engine\n(Semantic Retrieval Expansion)"]
        WebApp --> ChatProxy["NDJSON Stream Proxy\n(/api/lightrag-query)"]
        WebApp --> MailService["Digest & Notification Service\n(Nodemailer SMTP)"]
    end

    subgraph External & University AI Infrastructure
        VALERI -->|System Prompts & Impact Analysis| Azure["Azure OpenAI GPT-4.1"]
        Radar -->|Classification & Summarization| AzureNano["Azure OpenAI GPT-4.1-nano"]
        ChatProxy -->|Graph RAG Query| LightRAGBackend["LightRAG K8s Service\n(viktor.thws.education)"]
    end

    subgraph Persistence Layer
        Radar --> MongoDB[("MongoDB Cluster\n(valeri_db)")]
        WebApp --> LocalStore[("Local Encrypted State / JSON DB\n(Companies, Chats, Projects)")]
    end
```

---

## 🛡 Security & Sanitization Statement

> [!NOTE]
> This public repository contains **sanitized code** prepared specifically for academic review and Master's admissions committees. All sensitive operational secrets, private API keys, SMTP credentials, and actual company registration data have been decoupled from the codebase and replaced with environment variables (`.env.example`) and synthetic demo fixtures (`data/`).

---

## 📦 Docker Container Ecosystem

Multiple services developed for this project have been containerized and deployed:

| Image Name | Purpose | Docker Hub Link |
| :--- | :--- | :--- |
| `viktorbuild/enefitbot` | Primary Enefit conversational assistant container | [Docker Hub](https://hub.docker.com/r/viktorbuild/enefitbot) |
| `viktorbuild/news-parser` | Background news crawler and content extractor | [Docker Hub](https://hub.docker.com/r/viktorbuild/news-parser) |
| `viktorbuild/rss-generator-ihkwurzburg` | RSS generator scraping regional IHK news | [Docker Hub](https://hub.docker.com/r/viktorbuild/rss-generator-ihkwurzburg) |
| `viktorbuild/flowise-monitor` | Health check & pipeline monitor for LLM chains | [Docker Hub](https://hub.docker.com/r/viktorbuild/flowise-monitor) |

---

## 🚀 Local Quickstart

### 1. Installation
```bash
git clone https://github.com/ViktorBuild/enefit_digital_services.git
cd enefit_digital_services
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env
# Edit .env with your Azure OpenAI and MongoDB credentials
```

### 3. Run Development Server
```bash
node server.js
```
The application will launch on `http://localhost:3000`.

---

## 👤 Author & Research Team
**Viktor** — Lead Developer of Digital Services (Continuous development since 2024)  
Institute for Energy and Systems ([INSYS](https://www.thws.de/en/research/institutes/insys/)), THWS  
Email: [kakhno.viktor@gmail.com](mailto:kakhno.viktor@gmail.com) • GitHub: [@ViktorBuild](https://github.com/ViktorBuild) • Docker Hub: [viktorbuild](https://hub.docker.com/u/viktorbuild)
