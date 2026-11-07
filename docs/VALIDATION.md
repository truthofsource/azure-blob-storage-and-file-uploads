# Validation and Evidence Limits

Local checks completed November 6, 2026, before publication.

| Check | Observed result | Limit |
| --- | --- | --- |
| Application rules | 34 tests passed, zero failures | Actual selected rules with fictional inputs; no full app build or SQL transaction |
| Terraform configuration | Formatting and validation passed; signed AzureRM 4.81.0 lock file included | No live plan or apply |
| Terraform tests | Five simulated-provider cases passed | Four original network tests plus one added recovery/container/grant regression |
| Browser reference | Three tabs, 12 collection mappings, four decisions, five stages and four role rows verified | Local reference viewer, not hosted application acceptance |
| Mobile and keyboard | 390-pixel layout without page overflow; keyboard tab changes passed | One desktop/mobile browser engine |
| Browser requests | Zero page errors and zero external requests | Loopback-only demonstration |
| Public content | Relative links, source labels and code fences checked; Trivy secret scan found no secrets | Secret detection is not a vulnerability or privacy guarantee |
| Workflow | Actionlint passed; manual trigger only | Not dispatched; no hosted Actions minutes used |

Four screenshots are included: [overview](images/01-overview.png), [upload example](images/02-upload-example.png), [access and recovery](images/03-access-and-recovery.png), and [mobile](images/04-mobile.png).

## What these checks do not prove

No Azure account, private endpoint, SQL database, malware scanner, real applicant or signed-in application was exercised. No storage account was created and no live restore was performed. The screenshot viewer displays fictional data, and only the selected pure TypeScript rules run here. Header validation does not replace a full decoder or malware check.

The reference route depends on the full application's authentication and storage/database components. It is included for inspection, not claimed to be a standalone API. Terraform mocks check proposed configuration; they do not prove live DNS, permissions or deployment reachability. The manual GitHub workflow is not dispatched for this project.

## Plain-language review - November 7, 2026

The main overview now starts with the business problem, the solution and the
practical outcome. Technical commands and detailed results remain available in
expandable sections and linked guides. Links, heading anchors, formatting and
expandable sections were checked. Earlier code-test and cloud results remain
historical; this wording pass did not repeat those tests.

The fictional preview was also simplified, its screenshots refreshed, and its
desktop tabs and 390-pixel mobile layout checked locally. Browser requests were
restricted to the local preview; HTML structure and embedded scripts were unchanged.
