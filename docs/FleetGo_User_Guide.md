# FleetGo user guide

## About this guide

This guide explains how to use FleetGo to request vehicles, manage stock, arrange vehicle movements, check deliveries, and keep supporting records. It is written for people who do not need technical knowledge to do their work.

Edition: 11 November 2026. This guide describes the current application. Your account may show fewer menus because access depends on your job, organization, and assigned locations.

Read sections 1 to 4 first. Then use the task finder to go directly to the work you need to do. Complete only the steps that belong to your role. Button wording may vary between screens; always read the confirmation message before accepting an action.

## Task finder

- Sign in or recover your password: section 1.
- Learn the screen and common controls: section 2.
- Decide which section you need: section 3.
- Understand vehicle and request statuses: section 4.
- Review today's work: section 5.
- Add reference information or vehicles: sections 6 and 7.
- Check inventory, reserve, transfer, or count vehicles: sections 8 to 13.
- Request a vehicle or report an issue: section 14.
- Approve a request: section 15.
- Assign vehicles to an approved request: section 16.
- Arrange departure and manage a journey: sections 17 and 18.
- View vehicle locations: section 19.
- Inspect a vehicle or record damage: sections 20 and 21.
- Complete handover and proof of delivery: section 22.
- Download reports: section 23.
- Manage accounts and approval rules: section 24.
- Solve common problems: section 26.
- Follow a complete worked example: section 27.

## 1 Getting started and signing in

### Before your first sign in

Ask your administrator for the FleetGo website address, your account email, your initial password, and the role assigned to you. Ask which depot or organization you should work under. A depot is a place where vehicles are stored or handled.

The address http://localhost:5173 is the development address on the computer running this application. Other staff should use the website address provided by their administrator. The development address will not automatically open this app on another person's computer.

### Sign in

1. Open the FleetGo address in your browser.
2. Enter your assigned email and password on the sign-in page.
3. Click the sign-in button once and wait for the next screen.
4. Check the name and role shown near the top right. Make sure you are using your own account.
5. Open the required section from the menu on the left.

Check the result: the dashboard or another permitted page opens. If an access message appears, contact your administrator with the page name.

### If you forget your password

1. Select Forgot Password from the sign-in page.
2. Enter your account email.
3. Select Send reset instructions.
4. Follow the reset instructions provided by your organization.

In the current development setup, email delivery may not be configured. A development reset link may appear on the page. If no usable instructions arrive or appear, ask your administrator to help. A message saying instructions were issued does not prove that an email reached your inbox.

### Profile and password changes

Click your name near the top right. Select My Profile to view your name, email, role, organization information, and permissions. This profile page displays information; ask an administrator to correct account details. Use Change Password from the account menu when you need to replace your password, and complete the fields shown.

### Sign out

Use the sign-out option in the account menu when finished, especially on a shared computer. Closing a browser tab is not a substitute for signing out.

## 2 Finding your way around the screens

The menu on the left opens the main work areas. The menu button can expand or collapse it. On a smaller screen, open the navigation menu to see the sections. Tabs within a section open related tasks, such as Vehicles, Reservations, or Reports.

- Search: enter a known vehicle registration, vehicle code, or reference where the screen supports it.
- Filters: narrow the list by status, depot, dates, or another available choice. Remove filters if an expected record is missing.
- Pages: use the next and previous page controls to see more results. A visible table may contain only part of the full list.
- Record links: select the vehicle code, ticket number, or other linked reference to open its details.
- Required fields: complete fields marked as required. Read messages beside the field or above the form.
- Date and time: check the calendar date and displayed time before saving. Ask your supervisor if you are unsure which operational date to record.
- File uploads: choose the requested photo or document and wait for it to appear. Check that the upload belongs to the correct vehicle.
- Confirmation windows: read the action, vehicle, quantity, and reason before confirming.

### Saving your work

Save stores the information supported by that form. Save as Draft keeps a ticket for later submission. Submit sends a record into its next review stage. Approve records an authorized decision. Confirm can record a significant event, such as allocation or departure.

After any action, check the success message, resulting status, and record details. Do not assume that opening a record means it was submitted. If you see an unsaved-changes warning, choose Keep editing to preserve the form while you continue. Discard changes abandons the unsaved edits.

### When a form asks for an unfamiliar reference

Some screens show a technical record identifier, sometimes labelled UUID or ID. Do not invent one. Use a visible selection list where offered, follow a link from the related record, or ask an administrator to identify the correct record. For vehicle receiving, registration number can identify an existing vehicle without filling the optional vehicle UUID.

## 3 Choosing the right work area

Requesters normally work in Ticketing & Approvals and My Tickets. Approvers use Approval Inbox. Stock staff use Inventory Management. Operations staff use the combined Allocation, Dispatch & Trips workspace. Drivers and transport partners use the information and actions permitted to their account. Inspectors and receiving staff use Inspections & Handover. Administrators maintain reference information, accounts, and workflow rules.

Your role may combine several responsibilities. If a menu or button is missing, ask your administrator whether your role includes that task. Records are also limited by organization, custody, and depot assignments. Two users can correctly see different totals.

### The usual sequence

Set up reference information → Register a vehicle with arrival and custody details → Create a request → Approve the request → Allocate vehicles → Prepare inspection and dispatch → Confirm departure → Monitor the journey → Record delivery → Complete receiving checks and handover → Review reports.

Not every task uses every stage. For example, reporting a maintenance issue starts with an existing vehicle and a maintenance ticket.

## 4 Understanding the words and statuses

### Common words

- Fleet: all vehicle records within the area you can access.
- Inventory: vehicles tracked as stock, including availability, location, and who holds them.
- Custodian: the person or organization currently responsible for holding a vehicle.
- Ticket: a numbered request or issue record.
- Reservation: a temporary hold that blocks a vehicle's availability.
- Allocation: assigning a particular vehicle to an approved request.
- Dispatch: a planned and then confirmed vehicle departure.
- Trip: the journey associated with a dispatch.
- Evidence: supporting photos or documents.
- Reconciliation: comparing physical vehicles against the system's stock list.
- Discrepancy: a difference or problem, such as damage or a missing accessory.
- SLA: the target time allowed for approval or resolution.
- POD: proof of delivery, a document recording delivery information.

### Vehicle statuses

- Registered: a vehicle identity has been created; this alone does not make it available stock.
- Received: the vehicle's receipt has been recorded.
- Available: eligible for selection, subject to the request and other system checks.
- Reserved: held for a purpose and blocked from normal allocation.
- Allocated: assigned to an approved request.
- Dispatched: departure has been confirmed.
- In Transit: the vehicle is travelling.
- Delivered: delivery has been recorded. This does not automatically make the vehicle available for another request.
- At Vendor: held by a vendor.
- Under Maintenance: recorded as undergoing maintenance.
- Damaged: recorded with a damage status.
- Returned: a return has been recorded.
- Inactive: excluded from normal active use.

The app controls which status changes are allowed. Use the appropriate operational process instead of changing a status simply to make a blocked action succeed.

### Request progress

A draft is still being prepared. A submitted request may need one or more approvals. A request for information means the requester must clarify something. Approval allows the next permitted operational steps; it does not prove that a vehicle has departed. Completed or closed records represent a later stage of work. Check both approval progress and operational progress on the ticket.

## 5 Reviewing the dashboard

Purpose: identify work that needs attention and open the relevant records.

1. Select Dashboard from the left menu.
2. Review the summary cards for fleet, availability, tickets, approvals, trips, and deliveries shown to your role.
3. Review monitoring lists for overdue tickets, delayed journeys, pending inspections, or unresolved damage.
4. Select a linked card or record to investigate it.
5. Return to the dashboard after completing the action and refresh where needed.

Check the result: the relevant ticket, vehicle, trip, or inspection opens. Totals reflect your permitted records. Dashboard charts summarize data; open a record before making a decision about an individual vehicle.

## 6 Setting up master data

For authorized staff. Master Data contains the shared choices used throughout the app.

1. Open Master Data.
2. Choose the relevant area: Makes and Models, Types and Categories, Depots, Vendors, or Lookups.
3. Check whether the required item already exists.
4. Use the available add action and enter the details requested by that form.
5. Check spelling and any active or inactive setting, then save.
6. Return to the operational form and reload its choices if necessary.

For a vehicle model, choose the correct make. For a depot, use the agreed location name. Lookups contain choices such as fuel, ownership, and document types. Avoid creating slightly different names for the same item, such as two spellings of one depot. Ask an administrator before changing an item already used by existing records.

Check the result: the saved item appears in the appropriate reference list and can be selected where applicable.

## 7 Registering and viewing vehicles in Inventory

Purpose: register the car, record its insurance and arrival information, and add it to inventory in one step. Register it when it has arrived so location and custody reflect the real situation.

### Find a vehicle

1. Open Inventory Management > Vehicles.
2. Search by registration number or vehicle code and apply relevant filters.
3. Click anywhere on the matching vehicle row to open its details.
4. Verify the registration and VIN or chassis number before making any change.
5. Use Vehicle details for the car profile and Stock & custody for inventory history and operations.
6. Review its specifications, status, documents, and photographs.

### Add or edit a vehicle

1. Search first to avoid a duplicate record.
2. Use the add-vehicle action, or click its row in Inventory > Vehicles and choose Edit if available.
3. Enter the identity, make, model, type, and other details requested by the form.
4. Use the real registration and chassis information from reliable vehicle documents.
5. For a new car, complete Arrival & inventory details: arrival date/time, source organization, custody, condition, and optional odometer/accessories. Assigned organization and current depot are also required. Select optional photos, videos and PDF documents.
6. Click Register vehicle & add to inventory. Registration and inventory records are saved together.
7. Reopen the record to verify its condition, location, custody, insurance and attached media.
8. Select documents, photos and videos in the registration form before saving. If further files are needed later, use Edit in the same vehicle record.

When adding a document, attach the relevant PDF in the registration form. You can view saved files in Documents, Photos & Videos. Use Edit if further files are needed. A vehicle already controlled by inventory may have restrictions on edits or status changes; use Inventory Management for the corresponding stock operation.

## 8 Automatic inventory entry

There is no separate Receive vehicle screen. New cars enter inventory when you submit Inventory Management > Register vehicle with their arrival and custody information.

1. Register the car using the combined form described in section 7.
2. Open Inventory Management > Vehicles and search for its registration.
3. Check its current depot, custodian, condition, and movement history.
4. A car in good condition held at a depot becomes Available. A good car held by a vendor becomes At Vendor. Damaged cars become Damaged, and cars needing maintenance become Under Maintenance.
5. Use Inventory Management for later reservations, transfers, movements, reconciliation, and reporting.

The system still retains receipt, custody and status history automatically for traceability. Do not enter the same car again. If a photo or video upload fails after registration, open the already-registered vehicle and add the missing files from Documents, Photos & Videos.

## 9 Finding inventory and reviewing its history

1. Open Inventory Management → Vehicles.
2. Search for a vehicle or filter by depot, status, custody, availability, or receipt dates as offered.
3. Click the vehicle row to open its full profile, insurance information and saved documents.
4. Open Stock & custody to review reservations, assignment details, movement evidence, custody history, and chronological movement history.
5. Attach registration documents, photos and videos in the registration/edit form. Optional evidence for later stock movements belongs under Stock & custody.

Check the result: the vehicle identity, current location, custodian, and status agree with the physical facts. A missing vehicle may be on another results page or outside your filters or access. Check those before raising a new vehicle record.

## 10 Receiving several vehicles by bulk import

For authorized stock staff. Use this for a prepared list rather than registering each car separately.

1. Open Inventory Management → Bulk import.
2. Review the file instructions shown on the screen. Ask your administrator for the agreed spreadsheet format if one has not been supplied.
3. Upload a supported Excel or CSV file.
4. Match each file column to the corresponding field using the mapping controls.
5. Run the preview and inspect the proposed records and validation messages.
6. Correct invalid registrations, missing reference choices, duplicates, or other reported problems before committing.
7. Confirm the import only after the preview is correct.
8. Review the results. Download the error details if offered and compare the successful count with your expected count.
9. Spot-check imported vehicle records for depot, custody, dates, and condition.

Previewing does not complete the import. After a partial or uncertain result, inspect what was actually created before uploading again. If you are unfamiliar with spreadsheets, ask a supervisor to review the first import with you.

## 11 Reserving a vehicle

Purpose: temporarily hold a vehicle for a stated requirement. A reservation is separate from allocation to an approved request.

1. Open Inventory Management → Reservations.
2. In Reserve a vehicle, choose the eligible vehicle.
3. Select Requesting organization and Intended depot.
4. Enter Start, End, Purpose, and an optional Reference.
5. Check the period and vehicle identity, then submit and confirm.
6. Verify that the reservation appears and the vehicle's availability reflects the hold.

Important: reservations block availability immediately, including those with a future start date. Do not reserve a vehicle casually.

To cancel a reservation, open the available cancellation action, enter a clear cancellation reason, confirm, and check the updated status. An active reservation prevents normal allocation in the current workflow. Ask authorized stock staff to review an unneeded reservation before allocating the vehicle; cancellation does not itself allocate it.

## 12 Recording transfers and custody movements

Purpose: record an authorized stock movement or change in who holds a vehicle.

1. Open Inventory Management → Transfer.
2. Select the vehicle and movement type.
3. Select Destination depot or location and the receiving custodian information requested.
4. Enter Movement date and time, Reason, and any Reference or ticket number.
5. Add the supporting information requested by the form.
6. Review the destination and custody details, then submit and confirm.
7. Open Movements or the vehicle's inventory record to verify the new entry and current custody.

Reserved, allocated, and dispatched vehicles cannot be transferred through this form. Ask operations staff to review the related reservation, allocation, or dispatch. Do not use a stock transfer to bypass a dispatch or delivery process.

## 13 Checking physical stock through reconciliation

Purpose: investigate differences between the vehicles physically present and the system's stock list.

1. Open Inventory Management → Reconciliation.
2. Choose Scope type, such as Depot, Vendor, or Organization, and select the specific Scope.
3. Enter useful Session notes and select Review snapshot creation.
4. Confirm creation of the snapshot. This is the system's stock list at the start of the count.
5. Open the session and physically check the vehicles against that list.
6. Record the findings using the session controls, including missing, unexpected, damaged, or differently located vehicles where applicable.
7. Add clear reasons and evidence for any proposed correction.
8. Submit the session for independent review.
9. An authorized reviewer checks the evidence and approves or rejects the proposed adjustments.
10. Review the final session outcome and resulting vehicle records.

The person preparing the count cannot act as its independent approver. If stock has moved since the snapshot was created and the app rejects a stale adjustment, stop and ask the reviewer how to refresh or repeat the count. Do not force an old count onto newer stock information.

## 14 Creating and following a ticket

Purpose: request work and keep its decisions, discussion, and supporting records together.

### Choose the right ticket type

- Delivery: request delivery of a vehicle quantity to a location.
- New Vehicle: request a vehicle quantity with a justification.
- Pickup: request collection of an existing vehicle.
- Transfer: request movement of an existing vehicle between locations.
- Return: request return of an existing vehicle.
- Maintenance: report an existing vehicle's maintenance issue.
- Damage Incident: report a damage incident involving an existing vehicle.
- Replacement: request replacement of an existing vehicle.
- General: record another request that does not fit the specific types.

### Create and submit

1. Open Ticketing & Approvals → Create.
2. Select Ticket type. The fields change to suit that request.
3. Choose an appropriate Priority.
4. Enter a specific Subject, such as "Deliver two vehicles to the receiving depot".
5. In Description, explain what is needed and why.
6. Complete the displayed details: vehicle or vehicle type, quantity, source, destination, required date, and any additional fields.
7. Review any inventory availability information. It is a guide to stock, not a guaranteed allocation.
8. Save as a draft if you are still preparing it, or use the submit action when ready.
9. Open the ticket details, note its ticket number, and verify that its approval status shows the intended next stage.
10. Add supporting attachments or comments from the ticket details where needed.

If submission fails after the ticket was created, a draft may still exist. Check My Tickets and the ticket status before creating another request. A draft has not been sent through approval.

### Follow up

Open My Tickets for your own requests, or All Tickets for the records you are permitted to see. Open a ticket to review approval steps, comments, attachments, activity, and operational progress. If more information is requested, read the question, add the required details, and use the available response or resubmission action. Check the status again afterward.

For a maintenance ticket, describe the observed problem rather than guessing the repair. For a damage incident, include the incident date, place, factual description, and supporting photographs where available.

## 15 Reviewing and approving requests

For authorized approvers.

1. Open Ticketing & Approvals → Approval Inbox.
2. Open a pending request and verify its requester, organization, request type, quantity or vehicle, locations, date, and reason.
3. Read attachments, comments, and earlier approval decisions.
4. Choose Approve if the request is acceptable, Reject if it should not proceed, or Request information if clarification is needed.
5. Enter clear remarks and confirm the decision.
6. Check the recorded decision and the next approval step or resulting status.

Example of useful clarification: "Please confirm the receiving contact and the required delivery date." Give a specific reason for rejection so the requester knows what to correct.

Some requests have several approval steps. Your approval may move the request to another approver rather than finish the process. The app prevents self-approval where its rules require separation. Reassignment or escalation is available only where your role and the current step allow it.

Open the SLA tab to monitor target times and overdue work. An overdue label calls for follow-up; it does not mean a request has been automatically approved.

## 16 Allocating vehicles to an approved request

Before starting: the ticket must have completed the required approvals, and eligible vehicles must be available.

1. Open Allocation, Dispatch & Trips > Approved requests.
2. Select the ticket and review requested, already allocated, and pending quantities.
3. Open the new allocation action for that ticket.
4. Check Approved ticket, Source depot, Destination depot, Receiving organization or vendor, Transport partner, Planned dispatch, and Expected delivery as requested.
5. In Available inventory selector, search or filter for matching vehicles.
6. Verify each registration, vehicle type, depot, and availability before selecting it.
7. Select the needed vehicles, review the total, and confirm the allocation.
8. Note the allocation reference and verify the selected vehicles in its details.

If only one of two requested vehicles is available, a partial allocation can assign one while the remaining quantity stays pending. Reserved, damaged, maintenance, vendor-held, inactive, or already allocated vehicles are not normal eligible choices. The app checks availability again when you confirm, so a selection may fail if another user has just assigned the vehicle.

To cancel an undispatched allocation, open its cancellation action, record the reason, and verify the release. Existing dispatch plans must be cancelled first. Departed vehicles cannot be released through ordinary allocation cancellation.

## 17 Preparing and confirming dispatch

Purpose: record who is transporting the allocated vehicles, when they should arrive, and their departure evidence.

1. Open the allocation and follow its dispatch action, or use Create dispatch in the same Allocation, Dispatch & Trips workspace.
2. Select the vehicles to include. Only eligible items from the allocation can be used.
3. Select the transport partner and driver, and enter the schedule and other requested journey details.
4. Save the plan. A planned trip is created with the dispatch.
5. Open the dispatch details and work through each vehicle's readiness checklist.
6. Verify identity and registration, odometer, fuel, accessories, keys, and documents.
7. Upload the required original FRONT and REAR photos for every vehicle, plus any additional evidence needed.
8. Complete the required pre-dispatch inspection process and review any inspection-related block.
9. Resolve open high or critical operational exceptions and any other readiness failures.
10. Confirm the driver and transporter are correct, the licence is valid through the expected delivery, and the schedule is accurate.
11. When the vehicle actually departs, use the departure confirmation action.
12. Verify the actual departure, dispatch status, trip status, and transport custody information.

Confirming departure records an operational event. Do it at the appropriate time, after the real checks. Departure evidence becomes locked afterward, so inspect attachments before confirming.

If the app says the driver has another active trip, ask operations staff to review that assignment. If an inspection has been started, finish the required submission or review stage; a rejected pre-dispatch inspection blocks departure. Some installations also require a completed pre-dispatch inspection for every vehicle.

## 18 Managing trips and operational exceptions

### Update a journey

1. Open Dispatch & Trips → Trips and open the correct trip.
2. Verify the dispatch reference, vehicles, driver, destination, and planned times.
3. Review the timeline and record the next permitted milestone when it occurs.
4. Record delays, delivery attempts, and arrival or delivery information accurately.
5. Add supporting notes and evidence where requested.
6. Check the resulting status and timeline entry.

Common states include Planned, Ready for Dispatch, Dispatched, In Transit, Delayed, Delivery Attempted, Delivered, Failed Delivery, and Cancelled. Only the permitted next actions are accepted.

### Report an exception

1. Open the trip's exception action or the Exceptions section.
2. Choose the relevant issue, such as breakdown, delay, driver unavailable, incorrect destination, missing documents, or failed delivery.
3. Select severity and describe what happened, where, and what help is needed.
4. Add supporting evidence and save.
5. After the issue is handled, an authorized user records resolution notes and resolves it.

Reporting an exception does not by itself record a new delivery, custody change, or stock location. Record the appropriate operational action separately. After departure, cancellation needs operations review because a cancellation alone does not physically return the vehicle.

### Record delivery

Use the authorized trip delivery action when delivery actually occurs. Verify the destination, receiving party, and arrival information. Check that the trip and inventory show the resulting delivery state. Delivery does not automatically make stock Available. Receiving inspection and handover remain separate tasks. A ticket involving several vehicles may stay open until all requested quantities have been delivered.

## 19 Using live tracking

Purpose: view recorded vehicle positions and investigate journey alerts.

1. Open Live Tracking.
2. Check whether the selected source is REAL or SIMULATED.
3. Select a vehicle or trip with an active tracking session.
4. Review the latest location and its recorded time. An old position does not prove where the vehicle is now.
5. Review alerts and session details for further context.
6. Use Trip history & replay to examine recorded movement over a period.
7. If permitted, acknowledge or resolve alerts with meaningful remarks.

No position can be shown until data has been received. Real tracking requires a configured provider and an active device mapped to the vehicle. Authorized staff manage GPS devices, mappings, geofences, and provider settings. A geofence is a defined area used to raise location-related alerts.

SIMULATED data is for development or demonstration. It must not be treated as evidence of a real vehicle's location. Arrival near a destination on the map does not confirm delivery or handover; staff must complete the authorized operational steps.

## 20 Inspecting a vehicle

Before starting: physically check the correct vehicle and have clear photographs ready. Choose the inspection that matches the event: initial receipt, pre-dispatch, receiving, or return.

1. Open Inspections & Handover → Inspections and use the create action.
2. Select the inspection type and correct vehicle, with related dispatch or trip information where requested. A receiving inspection requires a linked dispatch.
3. Select the applicable template when offered. A template is the checklist for that kind of inspection.
4. Save the draft and complete its condition information and checklist responses.
5. Add all required photo categories and any supporting files. Verify each image belongs to this vehicle and event.
6. For receiving, select the correct outcome. Record discrepancies when the outcome reports damage or differences; give a reason if rejecting receipt.
7. Check the entire draft, then submit it.
8. An authorized reviewer approves or rejects the submitted inspection with remarks.
9. After approval and resolution of any outstanding discrepancies, an authorized user completes the inspection.
10. Verify the final status and linked records.

Once submitted, an inspection cannot be edited like a draft. Use the amendment process if a correction is needed. It creates a new version and retains the original record and photos. Ask the responsible reviewer if you cannot see the required action.

Take a clear overall view and close-ups of damage. Use factual notes such as "scratch on left rear door" rather than an unsupported conclusion about who caused it.

## 21 Comparing photographs and resolving discrepancies

### Compare condition evidence

1. Open Inspections & Handover → Comparison.
2. Select the vehicle and related dispatch where requested.
3. Compare the same photo category across the available inspection stages.
4. Check the date, uploader, and record reference for each image.
5. If there is a difference that needs investigation, record a discrepancy with relevant evidence.

Image differences are supporting information. The current app does not automatically decide that a person caused damage, and an AI damage detector is not supplied.

### Record and resolve a discrepancy

1. Open Discrepancies or the linked inspection's discrepancy action.
2. Select the vehicle and related inspection or dispatch.
3. Record the category, severity, factual description, and supporting evidence.
4. Save and note its reference.
5. Authorized staff investigate, add comments or evidence, and use the permitted status changes with remarks.
6. Confirm that the issue reaches its appropriate resolved outcome before completing a receiving inspection that depends on it.

Confirmation of major or critical damage can mark the vehicle Damaged in inventory. Review the vehicle's resulting status before planning further use. A receiving inspection cannot be completed while unresolved discrepancies remain.

## 22 Completing handover and proof of delivery

Purpose: record the transfer between parties and retain delivery documentation.

1. Open Inspections & Handover → Handover.
2. Create or open the appropriate handover for the vehicle and related operational record.
3. Verify the handing-over party, receiving party, destination, and linked inspection information.
4. Record each required acknowledgement using the controls available to the authorized parties.
5. Review and confirm the handover when its requirements are satisfied.
6. Check the completed handover record and any remaining required actions.
7. Open Proof of delivery and select or create the document for the relevant dispatch and vehicle.
8. Review its details before printing or saving it.

The default interface records named acknowledgements; do not expect a handwritten signature pad. Proof of delivery uses a printable page. To save it as a PDF, open the print view, press Ctrl+P, choose Save as PDF or your browser's equivalent, and save with a meaningful filename. Check the print preview first.

## 23 Viewing and exporting reports

1. Open Reports.
2. Choose Fleet, Inventory, Tickets & Approvals, Dispatch & Delivery, GPS Tracking, Inspection & Damage, or Vendor Performance.
3. Select the report type and relevant date, depot, organization, vendor, status, or source filters offered.
4. Review the summary and table. Use page controls to see further results.
5. Follow a linked record if you need the full operational details.
6. Export to CSV, Excel, or the printable PDF option as available.
7. Open the downloaded file and check its heading, filters, and contents before sharing.

CSV is a simple data file commonly opened in a spreadsheet. Excel provides a spreadsheet file. The PDF option opens a print-ready document; use the browser's Save as PDF function to produce the PDF file.

Use Report Builder to choose a report configuration. Save a frequently used configuration and reopen it under Saved Reports. Saving a configuration keeps your choices; it does not freeze the underlying business data. Export History shows recorded report generations.

Reports use your permitted records. Different roles can see different results. Exports are limited to 5,000 rows per file, so narrow the dates or other filters for larger datasets. REAL and SIMULATED GPS sources should be kept distinct when reviewing results.

Scheduled-report configuration currently records settings and run status. It does not automatically email reports or provide an external delivery service. Do not rely on a schedule as proof that somebody received a report.

## 24 Administrator tasks

### Users

1. Open User Management and its Users area.
2. Search for the person before adding a new account.
3. Use the add or edit action and complete the requested name, email, organization, and role details.
4. Check that the organization and role match the person's actual responsibilities.
5. Save, then review the resulting account entry.
6. Use the available status or password-reset actions when appropriate and confirm the result.

An inactive account is prevented from normal active use according to the account rules. Check with the responsible manager before changing another person's access.

### Roles and organizations

Use the Roles area to inspect the access assigned to roles and make only the changes the screen permits. Use Organizations to maintain the organizations referenced by accounts and operational records. A user's organization affects which information they can see. Never assign broad administrator access simply to work around a missing button.

### Approval workflows and inspection templates

Authorized administrators use Ticketing & Approvals → Workflows to maintain request approval rules and ordered steps. Review the request type, approver roles, step order, and time targets before saving.

Authorized inspection managers use Inspections & Handover → Templates to maintain inspection checklists and required photos. Coordinate changes with the people performing inspections so they know what evidence is required.

## 25 Features not yet available as complete pages

The separate Vendor Management page is a placeholder. Use Master Data for vendor reference records and the existing inventory, transporter, inspection, and reporting features for their implemented tasks.

Disk Logistics is a placeholder. The current page does not provide a complete process for recording disk or media movements.

The general Settings page is a placeholder. Some specific settings exist within implemented modules, such as tracking, but that does not make the general Settings page functional.

## 26 Common problems and what to do

### The website does not open

Check that you are using the address supplied by your administrator. If using the local development address, the application must be running on that computer. Tell support the address and the message displayed by the browser.

### My password is rejected

Check the email spelling, keyboard Caps Lock, and accidental spaces. Use Forgot Password or ask the administrator for account help. Repeated attempts with an uncertain password are unlikely to solve an inactive-account problem.

### A menu is missing or access is denied

Ask the administrator to check your role, organization, and depot assignments. Include the task you need to perform. A link to a restricted page will not grant permission.

### The list is empty or a record is missing

Remove filters, widen the dates, check other pages, and verify the reference. Ask whether the record belongs to another organization, location, or custodian. An empty list does not necessarily mean the business has no records.

### A save or submit fails

Read the full error and check required fields, dates, quantity, and reference choices. If the connection failed after clicking, reopen the list or record to see whether the change was saved before trying again. Avoid duplicate receipts, requests, or imports.

### A vehicle cannot be allocated

Check its current status, depot, reservation, and existing allocation. Check that the ticket is fully approved, has a remaining quantity, and matches the vehicle requirements. Ask operations or inventory staff to resolve the actual restriction.

### Departure is blocked

Open the readiness information. Check driver and licence validity, transporter, other active driver trips, vehicle checklist, required photos, inspection state, and high or critical exceptions. Correct the reported problem and check readiness again.

### A photo or document will not upload

Confirm it is a supported file and within the size limits shown by the app. Check that the file opens normally on your computer. Use a clear original image or supported document and wait for the upload result. Give support the file type and error, without sending unrelated confidential files.

### The map is blank or the location is old

Check the source filter and location timestamp. The vehicle may have no mapped active device, no active session, or no recent GPS data. Ask tracking support to investigate. A blank map does not mean the vehicle has arrived.

### I cannot edit a submitted inspection

This protects the submitted record. Ask an authorized user to create an amendment. The original evidence remains in the earlier version.

### I cannot complete a receiving inspection

Check review status and unresolved discrepancies. Resolve the outstanding items through their authorized workflow, then try the completion action again.

### A report differs from a colleague's

Compare report type, dates, filters, role, organization, depot scope, and GPS source. Check whether records changed between the two report runs.

### What to send support

Provide your name and organization, the page name, ticket or vehicle reference, approximate date and time, what you tried to do, and the exact error text. Include a screenshot if permitted by your organization. Never include your password or password reset token.

## 27 Worked example of a delivery request

This example uses two vehicles and a receiving depot. Choose the real names and details for your work.

1. The requester opens Create under Ticketing & Approvals, chooses Delivery, requests a quantity of two, selects the vehicle type and destination, and enters the required date and contact information.
2. The requester submits and verifies the ticket is awaiting approval rather than remaining a draft.
3. Each assigned approver reviews the request and records a decision. Operations proceeds after all required approvals are complete.
4. Operations opens the approved ticket queue and allocates two eligible Available vehicles. If only one is available, operations can allocate one and leave one pending.
5. Operations plans the dispatch, selects the transporter and driver, and enters the expected delivery time.
6. Staff inspect each vehicle, record the checklist, keys, documents, fuel and odometer, and upload the required photos.
7. Operations resolves readiness failures and confirms departure when the vehicles actually leave.
8. Tracking staff review recorded locations where GPS is configured. Operations records journey milestones and any exceptions.
9. An authorized user records actual delivery and checks the destination and recipient details.
10. Receiving staff inspect each vehicle, record discrepancies if present, obtain the required review, and resolve outstanding issues.
11. Authorized parties complete the handover acknowledgements and confirmation. Staff review and print or save proof of delivery.
12. The requester checks ticket progress. Operations confirms the full requested quantity has been delivered, and reporting staff review the resulting records.

## 28 Daily checklist

### At the start of the day

- Sign in to your own account and review the dashboard.
- Check approvals, overdue requests, planned departures, delayed journeys, and pending receiving work relevant to your role.
- Open individual records before deciding what action is needed.

### Before confirming an action

- Verify the vehicle registration and record reference.
- Check quantity, dates, source, destination, and responsible parties.
- Review supporting photographs and documents.
- Read the confirmation message and understand what it records.

### Before finishing

- Check that submitted work has the expected status.
- Record unresolved issues with enough detail for the next person.
- Save or deliberately discard unfinished drafts.
- Sign out, especially on a shared computer.

