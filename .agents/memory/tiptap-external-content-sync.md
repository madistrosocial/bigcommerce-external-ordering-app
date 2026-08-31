---
name: Tiptap external content sync
description: Tiptap 3 setContent syncs must explicitly suppress update events when parent state owns the HTML.
---

When RichTextEditor receives externally generated HTML, call Tiptap 3 `setContent` with `{ emitUpdate: false }`; passing the older boolean form can emit `onUpdate` and create a React render loop, especially for markup the editor does not model natively.

**Why:** Campaign product blocks include email-safe HTML tables and comments that Tiptap does not fully model, so an emitted sync update can continually alternate the editor and parent HTML.

**How to apply:** Preserve externally inserted blocks in the parent when needed, but always make the editor’s external-content synchronization non-emitting.