# Ticket reporting deployment reconciliation

The first enforcement release, managed task `8740002be503`, published the
reviewed implementation to main at `dd83f081440935493710553ffe78992bc602927c`.
Its Cloudflare upload failed with a network fetch error. The coordinator retained
`deploy_unknown` and did not replay the operation.

Provider deployments and versions were read independently after that failure.
The newest provider version was still number 131,
`34f284d7-1be2-43c2-be2f-55aba362a434`, created at 12:46:25 UTC. The active
provider deployment was `603c0ed6-63e6-49f5-8b83-70412d0ddd4f`, and the live
release endpoint still reported `9dbcebda5f9ffa927f19b4a7057a37eab48fbc08`.
No version or deployment for the failed candidate existed in those records.
The installed helper also remained on that prior revision; no reporting contract
had been installed.

Managed recovery task `600f385d3bf4` therefore submits a new audited release of
the already-published implementation plus this reconciliation note. This records
a confirmed absent deployment rather than replaying an uncertain external action.
The earlier task is retained until the replacement has its exact deployment and
live acceptance receipts. Existing workers, coordinator core, source and
credentials remain preserved. The 220-test CRM suite passed before submission;
managed integration reruns all required project checks.
