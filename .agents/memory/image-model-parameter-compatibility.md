---
name: Image model parameter compatibility
description: Model-specific request options for OpenAI image generation.
---

Do not assume image-generation models share all request parameters. The configured Image Editor model rejects `input_fidelity`, including on reference-image edits, so omit it.

**Why:** The provider returned an explicit unsupported-parameter error when the editor sent `input_fidelity: "high"`; this is separate from account quota or model access.

**How to apply:** When changing the configured image model or adding request options, verify each parameter against that model's accepted API shape. Avoid live generation requests for verification unless the user approves consuming their API quota.