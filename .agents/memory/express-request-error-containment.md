---
name: Express request error containment
description: Prevent request-level failures and rejected async middleware from terminating the application process.
---

Express 4 async middleware must forward rejected promises with `next(error)`. Error middleware should log the failure and send an HTTP response; do not throw after responding, because a single request error can terminate the whole server.

**Why:** The app's catch-all handler rethrew request errors after sending a response, and async permission middleware could reject without reaching that handler. Both patterns can turn a recoverable request failure into an application crash.

**How to apply:** Wrap asynchronous middleware in a promise chain with `.catch(next)`. Keep the final error handler non-throwing, log the stack server-side, and return a 500 response unless headers have already been sent.