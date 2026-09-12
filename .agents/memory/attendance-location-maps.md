---
name: Attendance location maps
description: Rules for exposing attendance home and login/logout coordinates to managers.
---

Attendance-admin views may expose saved home coordinates and captured time-in/time-out/checkpoint coordinates as direct Google Maps links. Employee-facing attendance APIs should continue returning only configuration state and timestamps, not raw coordinates or audit evidence.

**Why:** Managers need an actionable map view for attendance review, while employee screens should minimize technical location disclosure.

**How to apply:** Gate the location list with attendance dashboard permission and coordinate clearing with attendance management permission. Use Google Maps search URLs built from validated numeric latitude/longitude values.