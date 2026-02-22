# PolySync

**Stay in Sync.**

PolySync is an AI-powered Chrome extension that turns event screenshots into structured, calendar-ready entries in seconds.

Built for the **Poly Prompt Hackathon 2026** under the **College Life** category.

---

## Overview

College students frequently discover events through Instagram posts, digital flyers, emails, and websites. However, converting that unstructured visual content into usable calendar events requires manual typing — leading to forgotten details and missed opportunities.

PolySync eliminates this friction.

With one click, users can capture a screenshot of any browser tab, and AI instantly extracts structured event details. What was once a static screenshot becomes clean, editable, calendar-ready data in seconds.

---

## The Problem

Students:
- Discover events through screenshots and social media
- Forget key details (time, location, registration links)
- Delay adding events to their calendar
- Miss opportunities due to manual entry friction

Manual data entry discourages organization and leads to missed campus experiences.

---

## The Solution

PolySync introduces a seamless workflow:

1. Click **“Capture Event”**
2. Screenshot the current browser tab
3. AI extracts structured event details
4. Review and edit extracted information
5. Save locally or export as an ICS file
6. Sync to your calendar

From screenshot to structured plan — in under 10 seconds.

---

## How AI Powers PolySync

PolySync uses OpenAI’s **Responses API with vision capabilities** to:

- Analyze browser screenshots
- Detect whether an event is present
- Extract structured event fields in strict JSON format:
  - Title  
  - Date & Time  
  - Location  
  - Host  
  - Registration Link  
  - Cost  

This structured extraction ensures clean, consistent, calendar-ready output from unstructured visual content.

### AI in Development

AI was also used throughout the build process to:

- Interpret PRD and MVP requirements
- Structure the Chrome Extension under Manifest V3
- Design strict structured prompts
- Implement event storage logic
- Generate ICS export functionality

Human oversight was required for UI state handling and button logic, reinforcing responsible and thoughtful AI usage.

---

## Demo Story

Our demo follows a college student named Alex:

- She discovers a campus event on social media.
- Instead of manually typing details, she opens PolySync.
- Within seconds, event data is extracted automatically.
- She reviews and edits a minor detail.
- The event appears in her dashboard.
- She adds a friend and syncs it.
- Finally, she deletes the event and signs out — demonstrating full user control.

**Magic Moment:** Turning a screenshot into a structured, actionable event instantly.

---

## Technical Stack

- Chrome Extension (Manifest V3)
- OpenAI Responses API (Vision)
- Structured JSON extraction
- Local event storage
- ICS file export
- Light/Dark mode dashboard

---

## Hackathon Alignment

**Primary Category:** College Life  

PolySync directly supports student life by:
- Reducing friction in social planning
- Preventing missed campus opportunities
- Helping students stay organized effortlessly

### Judging Criteria Alignment

- **Technical Impressiveness (50%)**  
  Real-time AI vision extraction + structured output + working Chrome extension demo.

- **Impact (20%)**  
  Solves a common and meaningful student problem.

- **Product Thinking (10%)**  
  Clear problem → friction → AI-powered solution → calendar-ready output.

- **Use of AI to Build (10%)**  
  AI assisted development, prompt engineering, and structured output design.

- **Ethics / Responsible Use (10%)**  
  User review before saving  
  Editable extracted data  
  Local control and deletion  
  No silent background data usage  

---

## Ethics & Responsible Use

- Users must actively trigger screenshot capture.
- Extracted data is reviewable and editable before saving.
- Users can delete events at any time.
- No hidden scraping or background monitoring occurs.
- The tool extracts only visible content and does not fabricate events.

We prioritize transparency, user agency, and responsible AI deployment.

---

## Links

- Website: https://polysync.dev  
- Demo Video: (https://drive.google.com/file/d/1xc23FR5QGmBhK-4OJII7eaFdJeAZHSUv/view?usp=sharing) 

---

## Team — Jason’s Jesters

- **Tech Lead:** *(Name)*  
- **Product Lead:** *(Name)*  
- **Ethics Lead:** *(Name)*  

Built for Poly Prompt Hackathon 2026.

---

We focused on depth over breadth and built one clear, impactful experience for students:

**Capture → Extract → Sync.**

Stay in Sync.
