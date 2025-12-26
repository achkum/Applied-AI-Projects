# AI-Powered Email Workflow Automation

> **Production-ready email analysis and routing system using Google Gemini, FastAPI, and n8n**

## Overview

An enterprise-grade workflow automation system that:
- Reads emails from Gmail via API
- Analyzes content using Google Gemini LLM
- Generates structured insights (team routing, priority, risk assessment)
- Provides REST API for external integrations
- Caches results in SQLite to avoid duplicate processing
- Integrates with n8n for workflow orchestration


### Features
- **Gmail Integration**: OAuth 2.0 authentication, email fetching
- **LLM Analysis**: Google Gemini API for intelligent email understanding
- **Structured Output**: JSON format with team suggestions, priority levels, sentiment, risk scores
- **REST API**: FastAPI endpoints for triggering workflows programmatically
- **Persistence Layer**: SQLite database with SQLAlchemy ORM for deduplication
- **Workflow Automation**: n8n integration for scheduled/triggered execution
- **Professional Logging**: Centralized logging to console and file (`workflow.log`)
- **Routing Simulation**: Rule-based routing logic (simulation mode)

### Roadmap (Future)
- [ ] Human-in-the-loop escalation
- [ ] Advanced email parsing (multipart/HTML emails)
- [ ] PostgreSQL support for production deployments

---

## Project Structure

```
Workflow Automation/
├── src/
│   ├── api/             # FastAPI endpoints
│   ├── ai/              # Google Gemini LLM logic
│   ├── integrations/    # Gmail API integration
│   ├── db/              # Database models and session
│   ├── core/            # Pipeline and routing logic
│   └── utils/           # Logger and shared helpers
├── main.py              # Entry point for API server
├── run_pipeline.py      # Entry point for Script mode
├── config.yaml          # Gemini API key configuration
├── requirements.txt     # Python dependencies
├── gmail_token.json     # Gmail OAuth token
├── emails.db            # SQLite database
├── workflow.log         # Application logs
└── README.md
```

---

## Quick Start

### Prerequisites
- Python 3.8+
- Node.js (for n8n)
- Gmail API credentials (`credentials.json`)
- Google Gemini API key

### Installation

1. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure API Keys**
   - Copy `config.example.yaml` to `config.yaml`:
     ```bash
     cp config.example.yaml config.yaml
     ```
   - Add your Gemini API key to `config.yaml`.
   - Place your `credentials.json` (from Google Cloud Console) in the project root.

> [!IMPORTANT]
> Never commit `config.yaml`, `credentials.json`, or `gmail_token.json` to version control. They are already included in `.gitignore`.

3. **Authenticate Gmail**
   ```bash
   python run_pipeline.py
   ```
   (First run will open browser for OAuth consent)

### Usage

#### Option 1: Direct Script Execution
```bash
python run_pipeline.py
```

#### Option 2: REST API
```bash
python main.py
```
Then visit: http://127.0.0.1:8000/docs (Swagger UI)

#### Option 3: Docker (Recommended for Production)
1. **Build and Start**
   ```bash
   docker-compose up -d --build
   ```
2. **Check Logs**
   ```bash
   docker-compose logs -f
   ```
3. **Stop**
   ```bash
   docker-compose down
   ```

**Endpoints:**
- `GET /health` - Health check
- `POST /trigger-workflow` - Trigger email analysis

#### Option 3: n8n Automation
```bash
npm install n8n -g
n8n start
```
Visit http://127.0.0.1:5678, import `n8n_workflow.json`, and execute.

---

## Example Output

## JSON Response
```json
{
  "email_id": "19b5ac549b432abc",
  "subject": "KYC Document Request",
  "analysis": {
    "summary": "Customer requesting KYC compliance documents for account verification.",
    "issue_type": "kyc",
    "priority": "medium",
    "sentiment": "neutral",
    "suggested_team": "Compliance",
    "risk_score": 0.3
  }
}
```

## Logs (workflow.log)
```
2025-12-26 15:26:02 - workflow_automation - INFO - Database initialized
2025-12-26 15:26:03 - workflow_automation - INFO - Fetched email: [user@example.com] KYC Request
2025-12-26 15:26:03 - workflow_automation - INFO - ✓ CACHE HIT - Email 19b5ac549b43... already analyzed
2025-12-26 15:26:03 - workflow_automation - INFO - [ROUTER] Processing email 19b5ac549b432abc
2025-12-26 15:26:03 - workflow_automation - INFO -   -> Would route to Team: Compliance
```

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Language** | Python 3.8+ |
| **Email API** | Gmail API (OAuth 2.0) |
| **LLM** | Google Gemini (gemini-2.5-flash) |
| **Web Framework** | FastAPI |
| **Server** | Uvicorn (ASGI) |
| **Database** | SQLite + SQLAlchemy ORM |
| **Automation** | n8n (self-hosted) |
| **Logging** | Python `logging` module |
| **Config** | YAML |

---

## Database Schema

### `email_analysis` Table
| Column | Type | Description |
|--------|------|-------------|
| `id` | String (PK) | Gmail Message ID |
| `sender` | String | Email sender address |
| `subject` | String | Email subject line |
| `received_at` | String | Email timestamp |
| `analysis_json` | Text | Full JSON analysis result |
| `created_at` | DateTime | Record creation timestamp |

---

## Logging

Logs are written to:
1. **Console** (INFO level) - Real-time feedback
2. **workflow.log** (DEBUG level) - Complete audit trail

**Log Levels:**
- `DEBUG`: Detailed diagnostics (email IDs, DB queries)
- `INFO`: Workflow progress (cache hits, routing decisions)
- `WARNING`: Important notices (high-risk emails)
- `ERROR`: Failures (API errors, DB issues)

---

## Key Learnings / Skills Demonstrated

- **API Integration**: Gmail API, Google Gemini API
- **Backend Development**: FastAPI, RESTful design
- **Database Design**: SQLAlchemy ORM, data persistence
- **Workflow Automation**: n8n integration
- **Software Engineering**: Logging, error handling, caching strategies
- **AI/LLM Engineering**: Prompt design, structured output parsing

---

## Contact

**Achyuth Kumar Baddela**  
[LinkedIn](https://linkedin.com/in/yourprofile) | [GitHub](https://github.com/yourusername)