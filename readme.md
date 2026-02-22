PolySync

Stay in Sync.

PolySync is an AI-powered Chrome extension that turns event screenshots into structured, calendar-ready entries in seconds.

Built for the Poly Prompt Hackathon under the College Life category.

Overview

College students constantly discover events through Instagram posts, digital flyers, emails, and websites. However, converting that unstructured visual content into calendar events requires manual typing, leading to missed events and forgotten opportunities.

PolySync solves this problem.

With one click, users can capture a screenshot of any browser tab, and our AI extracts structured event details instantly — transforming scattered information into clean, editable, calendar-ready data.

The Problem

Students:

Discover events through screenshots and social media

Forget key details (time, location, registration links)

Delay adding events to their calendar

Miss opportunities due to friction in organization

Manual data entry is inefficient and discouraging.

The Solution

PolySync introduces a simple workflow:

Click “Capture Event”

Screenshot the current browser tab

AI extracts structured event details

Review and edit if needed

Save locally or export as an ICS file

Sync to your calendar

What was once a static screenshot becomes an organized, shareable plan — in under 10 seconds.

How AI Powers PolySync

PolySync uses OpenAI’s Responses API with vision capabilities to:

Analyze browser screenshots

Detect whether an event is present

Extract structured event fields in strict JSON format:

Title

Date & Time

Location

Host

Registration Link

Cost

This ensures consistent, clean, calendar-ready output from unstructured visual input.

AI in Development

Throughout the build process, AI was used to:

Interpret PRD and MVP requirements

Structure the Chrome Extension (Manifest V3)

Design strict structured prompts

Implement event storage logic

Generate ICS export functionality

Human oversight was required for UI state handling and button logic, reinforcing responsible and thoughtful AI usage.

Demo Story

Our demo follows a student named Alex:

She discovers a campus event on social media.

Instead of typing everything manually, she opens PolySync.

Within seconds, event details are extracted.

She reviews and edits a minor detail.

The event appears in her dashboard.

She adds a friend and syncs it.

Finally, she deletes the event and signs out — demonstrating full user control.

This showcases the core “magic moment”:
Turning a screenshot into a structured, actionable event instantly.

Technical Stack

Chrome Extension (Manifest V3)

OpenAI Responses API (Vision)

Structured JSON extraction

Local event storage

ICS file export

Light/Dark mode dashboard
