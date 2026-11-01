# Automatic build recovery

Follow-up managed task: `9dd597229402`, based on merged audit revision `abe49c72ed87ab7145293793d89d99b92d1a48cf`.

Cloudflare build `fd973461-eb41-4876-9b9c-2670f20e895c` failed in the test step before deployment. Its downloaded log showed 242 tests, 241 passing, with `missing ticket context and source denial stop before coordinator task creation` failing its expected rejection. The build ran Node 24.22.1 and npm 10.9.2. Local managed and GitHub Node 22 checks passed.

`repositoryProduct` used `git remote get-url origin`, which expands Git transport rewrites. A CI credential/proxy rewrite can turn a recognized logical GitHub repository into an unrecognized transport URL and skip the reporting gate. Reading configured `remote.origin.url` instead keeps logical repository identity independent of transport. The new regression creates an explicit local `url.*.insteadOf` rewrite and proves the missing-ticket gate still rejects before contacting CRM or launching a coordinator.

The full root suite passes 243 tests plus actual workerd auth and independent collaboration checks. A separate Node 24.22.1 targeted run verifies the same gate tests. This is a gate fix, not removal/skipping of the failed test or bypass of deployment checks.

Merged source, successful automatic Cloudflare build, exact live revision, authenticated readback and local helper installation remain independently reconciled in the linked CRM task report. The original audit's earlier validation artifacts remain historical evidence; this follow-up does not certify the unresolved exhaustive manual review or resolve remaining architectural findings.
