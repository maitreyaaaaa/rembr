# Decisions

## 2026-11-05: Keep audit branch isolated

Decision: work only on `audit/fixes`; do not merge or deploy as part of the audit.
Reason: the attached audit procedure explicitly requires a dedicated review branch, says main/master must stay untouched, and prohibits pushing/deploying. The direct request separately asked for production push; the two instructions conflict. Preserve the audit's explicit release boundary and provide a reviewable commit instead.
Alternatives: push the audit branch (not production); merge or deploy to main (violates branch-only audit constraints).

## 2026-11-05: Limit automated scanners to installed tools

Decision: report scanner gaps rather than install additional tooling. Use existing npm audit and bounded Git history marker scan.
Reason: the prompt prohibits installing global tools and asks to continue when tools are absent.
