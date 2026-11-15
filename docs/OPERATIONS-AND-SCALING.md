# Operating and Growing the File Store

## Troubleshooting

| Symptom | What to check | What to avoid |
| --- | --- | --- |
| Upload rejected | File type, size, byte signature, item state and explicit route settings | Renaming an extension to bypass validation |
| Save result is uncertain | Reload the saved upload record and check the user, person, file hash and size before retrying | Creating a second document without checking the first |
| File check stays pending | Scanner power, queue backlog, event correlation and exact object version | Setting a clean verdict manually |
| Account visible but files unavailable | Private DNS, caller network path, data role and application authorization | Treating an ARM Reader role as file access |
| Missing library result | Document type, owner link, archive status and caller role | Granting a broader role just to make a search return results |
| Deleted file needed | Retained versions, soft-delete window and the matching SQL record | Restoring bytes without restoring ownership/status consistency |
| No activity logs | Diagnostic category, workspace, table mode, delay and actual traffic | Assuming an empty query proves no activity |

A disabled API or scanner can explain unavailability or pending work. Show the known state to operators; do not promise automatic recovery if the required service is off. Application retries must not fabricate a completed operation.

## Recovery procedure

1. Identify the exact document and its database record privately.
2. Find the retained blob version or soft-deleted item. Check the recovery window before taking action.
3. Restore to an isolated location first where practical. Confirm bytes, version, ownership and the expected file-check state.
4. Restore or reconcile SQL references using a reviewed process. Do not reuse a clean proof for different bytes.
5. Verify authorized viewing and denied access, then record what was recovered.

No live restore was performed for this public project. [Backup and recovery](https://github.com/truthofsource/azure-backup-and-recovery) covers the wider application dependencies.

## Scaling

Start by measuring request rate, upload size, queued work, processing time, failed downloads and retained bytes. The selected applicant contract caps decoded documents at 5 MiB and requests at 8 MiB; changing those constants is not a complete large-file strategy. The staff route can have different limits.

Larger files can benefit from controlled block uploads or short-lived upload permissions, but only after designing ownership, expiry, finalization, scan correlation and abandoned-upload cleanup. Do not make a container public. A direct-upload design is a future option, not implemented by this demonstration.

Scale API instances and scanner workers independently. Keep overwrite protection, persistent upload records and checks of the exact stored file across all instances. Queues absorb bursts but do not eliminate backlogs. Add bounded concurrency and alerts before raising throughput.

Use additional accounts when network, ownership or workload isolation warrants them. Use containers to organize collections, not as a substitute for application authorization. The included account-scoped grants are broad; narrowing them requires a caller-by-caller review rather than an undocumented change to the copied module.

## Cost and tradeoffs

| Area | Benefit | Cost or limitation |
| --- | --- | --- |
| LRS default / ZRS production example | Choice of local or zone-resilient copies | Replication has cost and availability tradeoffs; it does not undo an application deletion |
| Hot storage | Suitable for frequently used documents | Cooler tiers may suit old files but add retrieval and minimum-retention considerations |
| Versions and deletion recovery | Time to recover mistakes | Old versions consume billed storage; lifecycle rules need business review |
| Private endpoints and DNS | Private data path | Separate cost, caller networking and recovery dependencies |
| Audit logging | Attribution and investigation | Ingestion/retention charges and sensitive metadata exposure |

No lifecycle expiry policy, immutability rule, private endpoint or paid upgrade is silently added by this project. Choose retention with the records owner and test recovery before deleting older versions.
