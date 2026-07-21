# GitHub repository setup

Repository: `iberfit/iberfit-m26-app`

Recommended settings after the first push:

- Private repository.
- Default branch: `main`.
- Require pull request before merging.
- Require one approval.
- Require `validate` status from `IBERFIT M26 CI`.
- Require conversation resolution.
- Block force pushes and branch deletion.
- Do not enable automatic deployment from `main` until the canary gate is approved.
- Configure environment `m26-canary-readonly` with approval and read-only QA secrets.
