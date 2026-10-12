---
name: Attendance location maps
description: Rules for exposing attendance home and login/logout coordinates to managers.
---

Attendance-admin views may expose saved home coordinates and captured time-in/time-out/checkpoint coordinates as direct Google Maps links only to users with `attendance:view_home_locations`. Employee-facing attendance APIs should continue returning only configuration state and timestamps, not raw coordinates or audit evidence.

**Why:** Managers need an actionable map view for attendance review, while employee screens should minimize technical location disclosure.

**How to apply:** Gate location navigation, log-detail actions, and every API response containing coordinates/checkpoints with the dedicated `attendance:view_home_locations` permission; hiding maps in the UI alone is insufficient. Coordinate clearing remains gated by attendance management permission. Use Google Maps search URLs built from validated numeric latitude/longitude values.