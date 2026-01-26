# Litera.ai — Technical Architecture Document v2
## Multi-Phase Implementation for Replit Build

**Version:** 2.0  
**Date:** January 2026  
**Companion Document:** Litera.ai PRD v2.0  

---

## 1. Architecture Philosophy

### Design Principles

1. **Phase-Progressive Architecture:** Build for today, architect for tomorrow. Every Phase 1 component should have clear extension points for Phase 2-4 features.

2. **React-First Frontend:** Enables PWA, future mobile (React Native), and chatbot UI patterns.

3. **API-Driven Backend:** Clean separation allows future mobile apps, third-party integrations, and FHIR connectivity.

4. **Feature Flags Over Branches:** Interface-only features are controlled by flags, not separate codebases.

5. **Regulatory Compliance as Code:** TCM timing rules, HITL gates, and audit logging are enforced at the data layer.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐          │
│   │   Clinician     │   │    Patient      │   │     Admin       │          │
│   │   Dashboard     │   │    PWA          │   │   Dashboard     │          │
│   │   (React)       │   │   (React)       │   │   (React)       │          │
│   │                 │   │                 │   │                 │          │
│   │ • Upload        │   │ • Care View     │   │ • Patient List  │          │
│   │ • Review/Edit   │   │ • Check-in      │   │ • Alerts        │          │
│   │ • Approve       │   │ • Lang Toggle   │   │ • Export        │          │
│   │ • Send          │   │ • TTS (P2)      │   │ • Analytics*    │          │
│   │ • EHR Shell*    │   │ • Chat (P3)*    │   │ • Revenue*      │          │
│   └────────┬────────┘   └────────┬────────┘   └────────┬────────┘          │
│            └─────────────────────┴─────────────────────┘                    │
│                                  │                                          │
│                        ┌─────────▼─────────┐                                │
│                        │    Vite + React   │                                │
│                        └─────────┬─────────┘                                │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │ REST API
┌──────────────────────────────────┼──────────────────────────────────────────┐
│                              API LAYER                                      │
├──────────────────────────────────┼──────────────────────────────────────────┤
│                        ┌─────────▼─────────┐                                │
│                        │      Flask        │                                │
│                        │   Application     │                                │
│                        └─────────┬─────────┘                                │
│                                  │                                          │
│    ┌─────────────┬───────────────┼───────────────┬─────────────┐           │
│    │             │               │               │             │           │
│ ┌──▼──┐      ┌───▼───┐      ┌────▼────┐     ┌───▼───┐    ┌────▼────┐      │
│ │Auth │      │Ingest │      │   AI    │     │Deliver│    │ Admin   │      │
│ │Svc  │      │ Svc   │      │  Svc    │     │  Svc  │    │  Svc    │      │
│ └─────┘      └───────┘      └─────────┘     └───────┘    └─────────┘      │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────────┐
│                           SERVICE LAYER                                     │
├──────────────────────────────────┼──────────────────────────────────────────┤
│    ┌─────────────┬───────────────┼───────────────┬─────────────┐           │
│ ┌──▼───────┐ ┌───▼───────┐ ┌─────▼─────┐ ┌──────▼──────┐ ┌────▼─────┐     │
│ │Extraction│ │Simplify   │ │Translation│ │ RAG (P2)    │ │Scheduler │     │
│ │• PDF     │ │• GPT-4o   │ │• GPT-4o   │ │• Vector DB  │ │• Check-in│     │
│ │• Image   │ │• Validate │ │• Back-    │ │• Retrieval  │ │• Drip    │     │
│ │• Manual  │ │• Adaptive │ │  translate│ │• Augment    │ │• Alerts  │     │
│ └──────────┘ └───────────┘ └───────────┘ └─────────────┘ └──────────┘     │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┼──────────────────────────────────────────┐
│                            DATA LAYER                                       │
├──────────────────────────────────┼──────────────────────────────────────────┤
│   ┌──────────┐  ┌───────────┐  ┌─┴───────┐  ┌───────────┐  ┌────────────┐  │
│   │PostgreSQL│  │   Redis   │  │Pinecone │  │  OpenAI   │  │  Resend/   │  │
│   │• Tables  │  │• Job Queue│  │ (P2)    │  │• GPT-4o   │  │  Twilio    │  │
│   │• Audit   │  │• Cache    │  │• Vectors│  │• Vision   │  │• Email     │  │
│   └──────────┘  └───────────┘  └─────────┘  └───────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

* = Interface-only in Phase 1
```

---

## 3. Technology Stack

### Frontend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | React 18 + TypeScript | Enables PWA, future mobile |
| Build | Vite | Fast HMR, Replit-friendly |
| Routing | React Router 6 | Standard SPA routing |
| Server State | TanStack Query | API caching, mutations |
| Client State | Zustand | Simple global state |
| Styling | Tailwind CSS | Rapid prototyping |
| Components | shadcn/ui | Accessible primitives |

### Backend
| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Flask 3.x | Simple, Python-native |
| ORM | SQLAlchemy 2.x | Type hints, async ready |
| Validation | Pydantic 2.x | Request/response schemas |
| Task Queue | RQ + Redis | Background jobs |
| PDF | PyMuPDF | Fast text extraction |

### External Services
| Service | Purpose | Phase |
|---------|---------|-------|
| OpenAI | GPT-4o, Vision, TTS | 1 |
| Resend | Email | 1 |
| Pinecone | Vector DB for RAG | 2 |
| Twilio | SMS, WhatsApp | 2-3 |
| OpenEvidence | Medical AI | 5 |

---

## 4. Key Service Implementations

### Simplification Service with RAG

```python
# server/app/services/simplification.py
from pydantic import BaseModel
import openai
import textstat

class SimplificationResult(BaseModel):
    text: str
    original_grade: float
    simplified_grade: float
    attempts: int
    passed_validation: bool
    rag_chunks_used: list[str] = []

class SimplificationService:
    def __init__(self, openai_client, rag_service=None, target_grade=5):
        self.client = openai_client
        self.rag = rag_service
        self.target_grade = target_grade
    
    def simplify(self, text: str, medications: list[dict] = []) -> SimplificationResult:
        original_grade = textstat.flesch_kincaid_grade(text)
        
        # Phase 2: RAG augmentation
        rag_context = ""
        rag_chunks = []
        if self.rag and medications:
            rag_result = self.rag.retrieve_medication_context(medications)
            rag_context = rag_result.context
            rag_chunks = rag_result.chunk_ids
        
        simplified, attempts = self._generate_with_validation(text, rag_context)
        simplified_grade = textstat.flesch_kincaid_grade(simplified)
        
        return SimplificationResult(
            text=simplified,
            original_grade=original_grade,
            simplified_grade=simplified_grade,
            attempts=attempts,
            passed_validation=simplified_grade <= self.target_grade + 1,
            rag_chunks_used=rag_chunks
        )
    
    def _generate_with_validation(self, text: str, rag_context: str = "") -> tuple:
        max_attempts = 3
        
        for attempt in range(max_attempts):
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": self._system_prompt()},
                    {"role": "user", "content": self._build_prompt(text, rag_context)}
                ],
                temperature=0.3 + (attempt * 0.1)
            )
            
            simplified = response.choices[0].message.content
            grade = textstat.flesch_kincaid_grade(simplified)
            
            if grade <= self.target_grade + 1:
                return simplified, attempt + 1
        
        return simplified, max_attempts
    
    def _system_prompt(self) -> str:
        return f"""You are a health literacy expert. Simplify to grade {self.target_grade}.

RULES:
1. Max 15 words per sentence
2. Replace jargon: "administer"→"take", "BID"→"twice a day"
3. Keep drug names exactly as written
4. Use active voice
5. Number multi-step instructions

Return ONLY the simplified text."""
    
    def _build_prompt(self, text: str, rag_context: str) -> str:
        prompt = f"Simplify this:\n\n{text}"
        if rag_context:
            prompt += f"\n\nIMPORTANT CONTEXT:\n{rag_context}"
        return prompt
```

### RAG Service (Phase 2)

```python
# server/app/services/rag.py
from pydantic import BaseModel
from pinecone import Pinecone

class RAGResult(BaseModel):
    context: str
    chunk_ids: list[str]
    warnings: list[str]

class RAGService:
    def __init__(self, pinecone_client, openai_client, index_name: str):
        self.index = pinecone_client.Index(index_name)
        self.openai = openai_client
    
    def retrieve_medication_context(self, medications: list[dict], top_k=3) -> RAGResult:
        all_chunks = []
        warnings = []
        
        for med in medications:
            query = f"{med['name']} patient instructions warnings"
            embedding = self._embed(query)
            
            results = self.index.query(
                vector=embedding,
                top_k=top_k,
                filter={"type": {"$in": ["medication_guide"]}},
                include_metadata=True
            )
            
            for match in results.matches:
                if match.score > 0.75:
                    all_chunks.append({
                        "id": match.id,
                        "content": match.metadata.get("content", ""),
                    })
        
        # Check for drug interactions if multiple meds
        if len(medications) > 1:
            interaction_result = self._check_interactions(medications)
            warnings.extend(interaction_result)
        
        context = "\n\n".join([c['content'] for c in all_chunks])
        
        return RAGResult(
            context=context,
            chunk_ids=[c['id'] for c in all_chunks],
            warnings=warnings
        )
    
    def _embed(self, text: str) -> list[float]:
        response = self.openai.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    
    def _check_interactions(self, medications: list[dict]) -> list[str]:
        # Query for known interactions
        med_names = " ".join([m['name'] for m in medications])
        query = f"drug interaction {med_names}"
        embedding = self._embed(query)
        
        results = self.index.query(
            vector=embedding,
            top_k=2,
            filter={"type": "interaction_warning"},
            include_metadata=True
        )
        
        return [m.metadata.get("content") for m in results.matches if m.score > 0.8]
```

### Delivery Service

```python
# server/app/services/delivery.py
from abc import ABC, abstractmethod
import resend

class DeliveryChannel(ABC):
    @abstractmethod
    def send(self, to: str, subject: str, content: str) -> dict:
        pass

class EmailChannel(DeliveryChannel):
    def __init__(self, api_key: str, from_email: str):
        resend.api_key = api_key
        self.from_email = from_email
    
    def send(self, to: str, subject: str, content: str) -> dict:
        try:
            result = resend.Emails.send({
                "from": self.from_email,
                "to": to,
                "subject": subject,
                "html": content
            })
            return {"success": True, "channel": "email", "id": result.get("id")}
        except Exception as e:
            return {"success": False, "channel": "email", "error": str(e)}

class SMSChannel(DeliveryChannel):  # Phase 2
    def __init__(self, account_sid: str, auth_token: str, from_number: str):
        from twilio.rest import Client
        self.client = Client(account_sid, auth_token)
        self.from_number = from_number
    
    def send(self, to: str, subject: str, content: str) -> dict:
        try:
            message = self.client.messages.create(
                body=content[:1600],  # SMS limit
                from_=self.from_number,
                to=to
            )
            return {"success": True, "channel": "sms", "id": message.sid}
        except Exception as e:
            return {"success": False, "channel": "sms", "error": str(e)}

class DeliveryService:
    def __init__(self):
        self.channels = {}
    
    def register_channel(self, name: str, channel: DeliveryChannel):
        self.channels[name] = channel
    
    def send(self, to: str, subject: str, content: str, preferred: str = "email"):
        if preferred in self.channels:
            result = self.channels[preferred].send(to, subject, content)
            if result["success"]:
                return result
        
        # Fallback to email
        if preferred != "email" and "email" in self.channels:
            return self.channels["email"].send(to, subject, content)
        
        return {"success": False, "error": "No channel available"}
```

---

## 5. Frontend Patterns

### Interface-Only Component

```tsx
// components/shared/InterfaceShell.tsx
interface Props {
  title: string;
  description: string;
  targetPhase: number;
  children?: React.ReactNode;
}

export function InterfaceShell({ title, description, targetPhase, children }: Props) {
  return (
    <div className="relative border-2 border-dashed border-gray-300 rounded-lg p-6">
      <div className="absolute top-2 right-2 bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
        Coming Phase {targetPhase}
      </div>
      <div className="opacity-50 pointer-events-none">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-gray-500 text-sm">{description}</p>
        {children}
      </div>
      <button className="mt-4 text-blue-600 text-sm hover:underline">
        Request Early Access →
      </button>
    </div>
  );
}
```

### Feature Flag Hook

```tsx
// hooks/useFeatures.ts
import { useAppStore } from '../stores/appStore';

export function useFeature(name: string): boolean {
  const features = useAppStore((state) => state.features);
  return features[name] ?? false;
}

// Usage
function PatientView() {
  const ttsEnabled = useFeature('tts');
  const chatEnabled = useFeature('chat');
  
  return (
    <div>
      {ttsEnabled ? <TTSButton /> : <InterfaceShell title="Read Aloud" targetPhase={2} />}
      {chatEnabled ? <ChatWidget /> : <InterfaceShell title="Ask Questions" targetPhase={3} />}
    </div>
  );
}
```

---

## 6. Database Schema

See PRD v2.0 Section 3 for complete schema. Key tables:

- `users` - Clinicians and admins
- `patients` - Patient demographics
- `patient_profiles` - Adaptive learning data (Phase 2)
- `care_plans` - Discharge plans with status workflow
- `care_plan_content` - Sections with original/simplified/translated text
- `check_ins` - TCM interactive contacts
- `behavioral_events` - Patient engagement signals (Phase 2)
- `audit_log` - Immutable compliance trail
- `knowledge_chunks` - RAG vector storage (Phase 2)

---

## 7. Environment Configuration

```bash
# .env.example

# === PHASE 1 (Required) ===
SECRET_KEY=your-secret-key
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=care@yourdomain.com

# === PHASE 2 ===
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
PINECONE_API_KEY=...
PINECONE_INDEX=litera-knowledge

# === FEATURE FLAGS ===
FEATURE_TTS=false
FEATURE_SMS=false
FEATURE_RAG=false
FEATURE_CHAT=false
FEATURE_ANALYTICS=false
FEATURE_EHR=false
```

---

## 8. Phase Migration Checklists

### Phase 1 → Phase 2

```bash
# 1. Add dependencies
pip install pinecone-client twilio

# 2. Run migrations
flask db revision -m "add patient profiles"
flask db upgrade

# 3. Set up Pinecone
python knowledge_base/ingest.py

# 4. Add secrets
# PINECONE_*, TWILIO_*

# 5. Enable features
# FEATURE_TTS=true, FEATURE_SMS=true, FEATURE_RAG=true
```

### Phase 2 → Phase 3

```bash
# 1. Apply for WhatsApp Business API
# 2. Create and submit message templates
# 3. Build chatbot service with intent classification
# 4. Create FAQ knowledge base
# 5. Enable: FEATURE_CHAT=true, FEATURE_ANALYTICS=true
```

---

## 9. Cost Projections

| Phase | Service | Usage | Est. Cost |
|-------|---------|-------|-----------|
| 1 | OpenAI | ~200 calls | ~$15 |
| 1 | Resend | ~150 emails | Free |
| 2 | OpenAI | ~500 calls | ~$30 |
| 2 | Pinecone | 100K vectors | Free |
| 2 | Twilio SMS | 300 msgs | ~$3 |
| 3 | WhatsApp | 1000 msgs | ~$50 |
| **Total MVP** | | | **<$50** |

---

*End of Technical Architecture Document v2*
