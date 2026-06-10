---
name: Rollup native binary fix
description: "@rollup/rollup-linux-x64-gnu missing causes startup crash; how to fix it"
---

The error "Cannot find module @rollup/rollup-linux-x64-gnu" occurs when optional npm dependencies are missing (common after deployments or dependency changes).

**Why:** npm sometimes skips optional dependencies due to a known bug (https://github.com/npm/cli/issues/4828). The rollup native binary is an optional package that tsx/vite requires at runtime.

**How to apply:** Use installLanguagePackages({ language: "nodejs", packages: ["@rollup/rollup-linux-x64-gnu"] }) in code_execution to fix it without running npm install directly.
