# LESSONS.md — LinkSnapr Lessons Learned

Every time the owner corrects a mistake, a lesson is written here.
Each lesson is a clear rule to prevent the exact same mistake again.
Read this at the start of every session before touching any code.

═══════════════════════════════════════════════════════════════
## LESSONS
═══════════════════════════════════════════════════════════════

LESSON 001 — April 2026
Always cover all 20 security threats in any security file without being asked.

LESSON 008 — Phase 1
npm audit shows 5 vulnerabilities in Next.js 14 itself.
Decision: stay on Next.js 14. Upgrading to Next.js 16
would break our approved stack and agent files.
Review again at Phase 6 before launch.

LESSON 011 — Phase 2 Testing
--testPathPattern is removed in Jest 30.
Correct flag is --testPathPatterns (plural).
Use npm test -- --testPathPatterns=filename instead.

LESSON 012 — Phase 2 Testing
TransformStream defaults to readableHighWaterMark: 0.
This means writer.write() blocks until the reader signals capacity.
Awaiting a write THEN reading deadlocks — both sides wait on each other.
Fix: use Promise.all([write, read]) so they run concurrently.
This applies to every test that reads from a TransformStream-backed readable.

═══════════════════════════════════════════════════════════════
# END OF LESSONS.md
═══════════════════════════════════════════════════════════════
