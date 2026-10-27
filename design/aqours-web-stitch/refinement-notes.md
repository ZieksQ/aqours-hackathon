All eight Aqours screens have been coordinated and refined to meet every requirement of the water supplier reporting and response portal:

### Key Adjustments Applied Across All Screens:
1. **Scope & Branding Alignment**:
   - Product name set consistently to **Aqours** with scope **Supplier portal**.
   - Removed all references to government bodies, hydraulic gateways, telemetry/live feeds, PSI metrics, and audit/dispatch session claims.
   - Clean color palette preserved: teal `#1B6C80`, neutral pale frame `#F4F7F6`, near-black buttons, and IBM Plex Sans typography.
   - Simplified footer on login: *"Water reporting, response and monitoring"*.

2. **Role & Navigation Integrity**:
   - **Admin screens (08, 09)**: Navigation restricted strictly to *Dashboard*, *Reports*, and *Accounts*. Top bar features Elena Cruz (Admin, `elena.cruz@example.com`).
   - **Staff screens (03, 04, 05, 06)**: Navigation restricted strictly to *Dashboard* and *Reports* (removed *Support*, *Settings*, *Accounts*, *Create account*, and utility shortcuts). Staff user Alex Reyes (`alex.reyes@example.com`).
   - **07 Collapsed Rail**: Preserved 64px rail with Dashboard & Reports icons, tooltip for expand (`Ctrl+B`), and an open account dropdown menu showing only *Change password* and *Sign out*.

3. **Data & Typography Consistency**:
   - Headers and status badges formatted in sentence case. Cards stripped of left colored bars, deltas, and timing promises.
   - **03 Staff Dashboard**: *My active reports* accurately set to **6**, alongside organization metrics of 12 Unassigned, 18 In progress, and 5 High priority. Daily bar chart totals set to `4, 5, 7, 6, 9, 8, 9` summing to 48. Replaced triage protocol with clean handler instructions.
   - **04 Reports & 07 Collapsed Layout**: Matched canonical report table fixture with 6 rows (AQ-1048, AQ-1047, AQ-1046, AQ-1045, AQ-1044, AQ-1042) and updated footer pagination to `"Showing 1–6 of 48 reports"`.
   - **05 Active Ticket AQ-1042**: Clear conversation stream with roles *Staff* and *Customer*, outline *Resolve ticket*, editable priority, 2,000-character plain text composer, and detailed report context with no technical invariant panels.
   - **06 Unassigned Ticket AQ-1048**: Prominent *Take report* action with explanatory copy. Disabled composer and read-only priority until taken.
   - **08 Accounts**: Exact breakdown of 18 accounts (2 Admin, 4 Staff, 12 Customers; 4 pending password change), 10 displayed rows, and setup states restricted to *Ready* or *Password change required*.
   - **09 Create Account**: Clean credential form with empty inputs, reveal toggle on password, default Staff role, password policy checklist, and helpful subtitle copy.

Optional Stitch suggestion (not implemented): Add export to CSV on the Accounts directory

Optional Stitch suggestion (not implemented): Create a mobile responsive view for Staff reports queue

Optional Stitch suggestion (not implemented): Preview the customer mobile view for submitting a report
