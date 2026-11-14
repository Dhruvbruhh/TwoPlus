---
description: Scan an AI agent skill for security risks with NVIDIA SkillSpector (static analysis by default).
---
Scan the skill at $ARGUMENTS with the `skillspector` CLI. Static analysis only, no LLM calls:

```bash
skillspector scan "$ARGUMENTS" --format terminal --no-llm
```

Read the report, open the source around every HIGH or CRITICAL finding, and give a verdict of
APPROVE, CAUTION, or REJECT using the rubric in `.agents/skills/skill-inspector/SKILL.md`.

Notes:
- `--output` is unsupported on Windows. Redirect stdout to a new file outside the scan target instead.
- Exit code 1 means findings, not a crash.
- Do not add `--llm` or set `SKILLSPECTOR_PROVIDER` unless asked: LLM analysis sends skill content off the machine.
