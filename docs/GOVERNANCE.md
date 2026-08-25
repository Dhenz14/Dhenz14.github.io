# Main-branch publication governance

## Enforced now

- GitHub Pages `build_type=workflow`
- Actions `allowed_actions=selected` with SHA pinning required
- Default `GITHUB_TOKEN` contents permission is read
- `main` cannot be force-pushed or deleted
- Hosted `contract` status check is required on `main`
- CODEOWNERS names owners for workflows, scripts, allowlist, and truth surfaces

## Intentionally deferred until a second reviewer exists

Required approving reviews would lock a solo-admin repository. When a second trusted
reviewer is available, enable:

- required pull-request reviews (count ≥ 1)
- required CODEOWNERS review for `.github/workflows/**`, `script/**`, and the Pages allowlist
- conversation resolution before merge

Merge commits must remain allowed so Commit A/B path preservation stays valid.
Do not enable required linear history for this repository while A/B identity matters.

## Emergency path

If `main` must be repaired when checks or reviewers are unavailable:

1. Record the incident in `docs/publication-receipts/`.
2. Temporarily lower only the blocking rule that prevents recovery.
3. Land the minimal fix through a pull request when possible.
4. Restore the blocking rule in the same working session.
5. Prefer merge commits over squash when A/B/C identity must remain ancestors.
