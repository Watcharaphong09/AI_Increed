# AI Dev Workspace (AI_Increed)

> **Local-first AI Development Orchestrator**  
> รับ Requirement ภาษาไทย → วิเคราะห์ → สร้าง Structured Tasks → ส่งให้ AI Coding Agent

---

## ภาพรวม

AI_Increed คือ Localhost Web Application ที่ช่วยจัดการ AI Coding Workflow ทั้งกระบวนการ:

```
User (ภาษาไทย)
↓
AI Planner → Requirement Analysis → Questions → Conflict Detection
↓
Project State (md files)
↓
Context Compression → Task Files
↓
AI Builder (Antigravity / External Agent)
```

## หลักการสำคัญ

- **Local-first** — ทำงานบน Localhost เท่านั้น ไม่มี Public Hosting
- **Token Efficiency** — ส่ง Context เฉพาะที่จำเป็น ไม่ส่งทั้ง Conversation
- **Role Separation** — Planner วางแผน, Builder เขียน Code แยกกันชัดเจน
- **Thai-first UI** — รองรับภาษาไทยทั้งหมด
- **Provider Agnostic** — เปลี่ยน AI Provider ได้โดยไม่ต้อง Rewrite

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python + FastAPI |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Database | SQLite (local file) |
| AI | OpenAI-compatible API (OpenAI / Groq / Azure / Ollama) |
| Storage | Local File System (.md files) |

## การติดตั้ง

### Requirements

- Python 3.11+
- Node.js 20+
- npm 10+

### ขั้นตอนการติดตั้ง

#### 1. Clone Repository

```bash
git clone https://github.com/Watcharaphong09/AI_Increed.git
cd AI_Increed
```

#### 2. ตั้งค่า Environment

```bash
cp .env.example .env
```

แก้ไข `.env`:

```env
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-your-api-key-here
AI_MODEL=gpt-4o-mini
```

#### 3. ติดตั้ง Backend Dependencies

```bash
cd backend
pip install -r requirements.txt
```

#### 4. ติดตั้ง Frontend Dependencies

```bash
cd frontend
npm install
```

### การรัน

#### Windows

```bat
start.bat
```

#### Linux / macOS

```bash
chmod +x start.sh
./start.sh
```

หรือรันแยก:

```bash
# Terminal 1 — Backend
cd backend
uvicorn main:app --host 127.0.0.1 --port 8000 --reload

# Terminal 2 — Frontend
cd frontend
npm run dev
```

เปิดเบราว์เซอร์: `http://localhost:3000`

---

## AI Provider Configuration

ระบบรองรับ Provider หลายตัวผ่าน `.env`:

### OpenAI
```env
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
```

### Groq
```env
AI_PROVIDER=openai
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_MODEL=llama-3.1-70b-versatile
```

### Azure OpenAI
```env
AI_PROVIDER=openai
AI_BASE_URL=https://YOUR_RESOURCE.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT
AI_API_KEY=...
AI_MODEL=gpt-4o
```

### Ollama (Local)
```env
AI_PROVIDER=ollama
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=llama3.2
```

### Per-Role Provider Override

```env
PLANNER_PROVIDER=openai
PLANNER_MODEL=gpt-4o
REVIEWER_PROVIDER=openai
REVIEWER_MODEL=gpt-4o-mini
```

---

## Planning Modes

| Mode | เหมาะกับ | Question Budget |
|---|---|---|
| QUICK | แก้ CSS, เปลี่ยนสี, Bug เล็ก | 3 |
| STANDARD | Feature ทั่วไป | 5 |
| DETAILED | Feature ที่มี Logic ซับซ้อน (Default) | 7 |
| DEEP | Project ขนาดใหญ่ | Phase-based |
| ARCHITECT | วางระบบใหม่ทั้งหมด | จนครบ Critical Requirements |
| AUTO | ให้ AI เลือก Mode ให้ | — |

---

## Project File Structure (Generated)

เมื่อ Approve Plan แล้ว ระบบจะสร้างไฟล์ที่ `workspace/{project-id}/`:

```
workspace/
└── {project-id}/
    ├── PROJECT.md          — สรุปโปรเจกต์
    ├── REQUIREMENTS.md     — Functional & Non-functional Requirements
    ├── ARCHITECTURE.md     — Technical Architecture
    ├── DECISIONS.md        — Key Technical Decisions
    ├── STATE.md            — Current Project State
    ├── TASKS.md            — Task Overview
    └── tasks/
        ├── TASK-001.md     — Task พร้อม Context ที่ Compress แล้ว
        └── TASK-002.md
```

---

## Security Notes

- API Keys เก็บใน `.env` เท่านั้น
- API Keys **ไม่ถูกบันทึก** ลงใน `.md` files ใดๆ
- ระบบ bind เฉพาะ `127.0.0.1` ไม่ expose ออก Internet
- `.env` อยู่ใน `.gitignore`

---

## License

MIT
