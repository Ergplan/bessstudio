# BESS Studio — the whole site

Two things at once, and the difference is marked on every line.

**Sections 1–10 record what the application does today**, written from the code. **Sections 11–20
are the proposal**: an interactive learning studio built around jouleWise ergOS, sized for the
Indian market, with a gated build plan. Nothing in 11–20 exists yet. Where a proposal changes
something that is already built, the current behaviour stays on the page and the proposal sits
beside it, so the two are never confused.

> **This documentation update has run no application tests and accepted no build stage.** Every
> proposed capability is `GAP` until code and evidence say otherwise. Writing a test into this plan
> is not evidence that it passed; all proposed tests start **NOT RUN**.

**This document is for editing.** Each section is numbered and self-contained. Mark up whatever
you want changed — in place, in the margins, however suits you — and hand the section back. The
convention that saves the most time:

| Marker | Means |
| --- | --- |
| `TODO:` | build this, it does not exist |
| `CHANGE:` | exists but is wrong — the note says what it should be |
| `DROP:` | remove it from the product |
| `ASK:` | you want a recommendation before deciding |

Anything unmarked is taken as correct and left alone.

Two conventions used throughout. **Staff** means anyone inside Solarworld — sales, approver,
engineer, admin, owner. **Customer** means the single external role. Where a figure is quoted it
comes from the real engines, not from an illustration.

> **Status key** — `LIVE` built and working · `PARTIAL` built but incomplete · `GAP` not built
>
> **Delivery states** (build progress, separate from the above) — PLANNED → BUILDING → TESTING →
> READY FOR ACCEPTANCE → ACCEPTED, and BLOCKED when a prerequisite or a mandatory check fails. The
> live register is [`docs/STAGES.md`](./STAGES.md).

---

## Contents

**Current state — what exists today**

1. [What the product is](#1-what-the-product-is)
2. [Who uses it](#2-who-uses-it)
3. [The workflows](#3-the-workflows)
4. [Screen by screen](#4-screen-by-screen)
5. [The 3D studio](#5-the-3d-studio)
6. [The offer document](#6-the-offer-document)
7. [What the numbers come from](#7-what-the-numbers-come-from)
8. [Design language](#8-design-language)
9. [Running and deploying](#9-running-and-deploying)
10. [Known gaps](#10-known-gaps)

**The proposal — none of this is built**

11. [Where jouleWise ergOS sits](#11-where-jouleWise-ergos-sits)
12. [The simulation model](#12-the-simulation-model)
13. [Simulation architecture and libraries](#13-simulation-architecture-and-libraries)
14. [Accuracy and evidence](#14-accuracy-and-evidence)
15. [The lesson catalogue](#15-the-lesson-catalogue)
16. [Commercial integration](#16-commercial-integration)
17. [How this gets built](#17-how-this-gets-built)
18. [Acceptance fixtures](#18-acceptance-fixtures)
19. [Requirement matrix](#19-requirement-matrix)
20. [Change log and open questions](#20-change-log-and-open-questions)

---

## 1. What the product is

### 1.1 Today `LIVE`

A battery storage design studio that takes one question — *what are we building today?* — and
carries it through sizing, engineering visualisation, lifetime economics and a printable
quotation, against one customer record.

It serves two populations in one system. A customer or a salesperson starts a design and gets
indicative pricing immediately; the sales team then picks it up, confirms the details and issues
a formal quotation that an approver has released.

Built and operated by jouleWise Technologies. Each organization on the platform carries its own
white-label branding on everything customer-facing; the reference tenant is Solarworld.

**Deliberate positions, worth challenging if you disagree:**

- The indicative quotation is **not** an offer and says so on its face. It exists to give a
  serious enquiry a number in ninety seconds, not to commit Solarworld to a price.
- **Pricing requires a verified email address.** Designing, sizing and the 3D assembly are open.
- **Preparing a quotation and releasing one are different permissions.** Sales cannot approve its
  own work.

### 1.2 Where it is going `GAP`

BESS Studio stays what it is — an engineering and quotation tool — and **earns a learning studio on
the far side of the quote**. The order matters and is deliberate:

> **size it → quote it → then understand it**

Someone sizes a plant with simple maths and physics, gets a quotation, and *then* the studio they
already built becomes the thing they learn from. They press Play on **their own configuration**,
change one control, and see what the battery, the PCS, the BMS and **jouleWise ergOS EMS** each
did. The central question the learning half answers is:

> **What happens inside this BESS when I change this input — and why?**

This is the opposite of a generic tutorial. The lesson is not a toy preset; it is the plant they
just priced, which is what makes it worth their attention.

**The opening experience does not change.** The landing wireframe assembly, the opening question,
the five-step build sequence and the workbench all stay exactly as built. Nothing in §11–20 touches
them. A learning mode that costs the product its first ninety seconds is not worth having.

> `CHANGE:` **This is a deliberate departure from the supplied specification**, which asked for
> Learn to be the default studio entry with no login for public examples. It is sequenced second
> instead, reached from a completed design. Rationale: the quoting journey is built, tested and
> working, and the configuration a user has just designed is a far better teaching subject than a
> generic preset. Public signed-out lessons remain possible later (§15.7) but are not the entry.

**The positioning is India-first.** Rupees, kVA contract demand, minutes of autonomy, lakh-scale
costs, Indian operating conditions and the lead-acid-versus-lithium question that every Indian site
actually asks. That is the market this is built to lead, and it shapes the default lesson set
(§15), the UPS sizing basis (§15.4) and the lifecycle-cost model (§15.5).

**The priority rule.** Simplicity and guided learning govern the initial interface and the release
scope. The engineering requirements in §12 describe the supporting model and optional advanced
capability. They are not a mandate to expose every parameter, screen or fault to a beginner.

Three consequences, each a real change to what exists:

- **Learn is a mode inside the 3D studio**, reached from a project or a quotation, not a new front
  door. The existing entry — landing, opening question, build sequence, workbench — is untouched.
- **Three interface modes over one project: Learn, Design, Engineering.** These are *views*, not
  new roles. The scenario survives switching between them. Authorization is unchanged.
- **Learning runs on the user's own configuration.** Tenant branding, customer isolation,
  verified-email pricing and approval separation all hold, unchanged, because the learner is
  already inside their own workspace.

---

## 2. Who uses it

Seven roles. One is external.

| Role | Sees | Can do | Cannot do |
| --- | --- | --- | --- |
| **Customer** | only records they raised | size a plant, price it indicatively, save it, submit it for a formal quotation | see anyone else's records, see the customer list, see the price book, approve anything, issue a price |
| **Sales** | the whole workspace | work the pipeline, prepare a formal quotation, send it for approval, issue an approved one, mark won/lost | approve a quotation — including their own |
| **Approver** | the whole workspace | everything sales can, plus release a quotation or return it with a reason | — |
| **Engineer** | the whole workspace | size and engineer projects | approve or issue prices |
| **Admin** | the whole workspace | manage members, branding, price books | — |
| **Owner** | the whole workspace | everything, including deleting the organization | — |
| **Viewer** | the whole workspace | read | write anything |

`LIVE` — the matrix lives in one place (`src/platform/types.ts`) and both the interface and the
Firestore rules are written from it. Eighteen tests cover the parts that must not drift.

### 2.1 Interface modes `GAP`

Orthogonal to roles. A mode changes what is on screen, never what a person is permitted to do.

| Mode | Who sees it by default | Shows |
| --- | --- | --- |
| **Learn** | everyone, including signed-out visitors on public lessons | three destinations only: **Choose a lesson**, **Simulation**, **What changed?** |
| **Design** | signed-in customers and staff | sizing, equipment selection, scenario comparison, the quotation path |
| **Engineering** | staff with `project.write` | full component tree, topology editing, solver settings, provenance |

**Decided: one level of approval inside the system.** `LIVE` — the tenant setting `approvalMode`
defaults to `single`. Whoever prepares a quotation issues it and downloads the PDF; the manager
approves that document **outside** the application, signing the **Internal approval** block the
offer now carries. One account runs the whole journey, which is what makes it testable.

The record is careful about this. Issuing writes `issuedBy` / `issuedAt` and **deliberately does not
touch the approval fields** — nobody approved it inside the system, so the record must not say they
did. The Firestore rules still refuse anyone with `quote.prepare` writing `approvedByUid`.

`two-step` remains available per tenant and keeps the original separation: prepare and release are
different people, an approver returns with a reason, and nobody releases their own work. Both paths
are built and tested. Full in-system RBAC on top of this comes later.

This resolves the conflict earlier flagged here — that `owner` and `admin` held both
`quote.prepare` and `quote.approve` and could release their own work. Under `single` that is the
intended behaviour and the document carries the real approval; under `two-step` it remains a
`GAP:` **record-level self-approval is still not blocked** — an owner may approve a quotation they
prepared. Worth closing when in-system RBAC lands.

**How a role is assigned:** `LIVE` — three ways, and no fourth.

1. **Invitation.** An owner or administrator creates one for an email address at a named role, and
   sends the link. There is no mail server on the free plan, so the link is copied to the clipboard
   to be sent by hand. Single-use, expires in 14 days, revocable.
2. **Customer self-registration.** If the workspace has opted in, anyone may register themselves —
   as `customer`, never as anything else.
3. **An administrator changing it** in Settings → Team & roles.

Nobody can mint a role. An invitation names it, or it is `customer`. The Firestore rules check the
same two things, so the client cannot talk its way past them — proved by 35 tests against the
real rules engine, each of which was confirmed to fail when the rule it covers is removed. Nobody may invite above their own
rank either — an administrator cannot create an owner.

---

## 3. The workflows

### 3.0 The learner, after the quote `GAP`

The journey that does not exist yet. It begins **where §3.1 ends** — a project sized, a quotation
raised — and turns that same configuration into the lesson.

1. From a project or a quotation, **Understand this system** opens the 3D studio in **Learn** mode,
   carrying the configuration already designed. Nothing is re-entered.
2. The studio offers lessons framed against *their* plant (§15): *what happens when your 8 MW
   system discharges at full power?* Each states one question, what it teaches, and roughly how
   long — 2–5 minutes.
3. A lesson loads complete, with a one-sentence goal and a Play button. No wizard.
4. Press Play. Energy flows on a compact clickable stack: battery, PCS, BMS, ergOS. At most four
   headline metrics and two synchronised charts.
5. The **ergOS is deciding** card shows: goal, what it observed, what it did, requested versus
   delivered power, and one plain sentence of reason. **Why?** opens the rule and the values.
6. Change **one** of at most three controls. Replay from the same initial state.
7. **What changed and why?** Then: Reset, Next lesson, or **Take this back to my design** — which
   returns the learned configuration to the project, flagging the quotation's assumptions as stale
   if anything material moved (§16).

**Acceptance:** a user who has just quoted a plant completes one meaningful comparison on it and
can state the distinction — *ergOS decides dispatch; PCS converts and delivers; BMS constrains and
protects; the battery stores energy*. Verified by an observed walkthrough, with confusion points
recorded. Until that walkthrough happens, usability is **not validated** and will not be claimed.

### 3.1 The customer, self-serve `LIVE`

1. Lands on the site, sees the wireframe assembly resolve into **BESS Studio**.
2. **Start building** opens *What are we building today?* — power, discharge hours, charge hours,
   application. The card reads back live what those imply: usable energy, unit count, C-rate,
   conversion.
3. **Build it** plays the five-step commissioning sequence (~11 s, skippable) while the plant is
   sized and saved.
4. Lands in the workbench on their new project, with every input still editable.
5. **Create quotation** produces an **indicative estimate**, clearly marked as illustrative.
6. **Submit for a formal quotation** hands it to sales. Status becomes *With our sales team*.
7. Watches it progress — *Being prepared* → *Being approved* → *Formal quotation issued*.

**How they get an account:** either **Create an account** on the sign-in page — which registers
them into the supplier's workspace as a customer, if that workspace has opened itself to public
registration — or an invitation link from the sales team. Never by creating a workspace of their
own.

**The gate:** steps 1–4 work without an account. Step 5 onwards needs a signed-in, **email-verified**
account. Until the address is verified, prices show as `Locked` and a banner explains why.

`ASK:` should step 5 require sign-in, or should an anonymous visitor get an indicative number and
be asked to sign in only to *save* it? Today it requires sign-in.

### 3.2 Sales `LIVE`

1. A submitted enquiry appears in **Quotes**.
2. **Pick up** — this is the moment the customer's estimate becomes a formal quotation. The
   customer keeps sight of it; they lose the pen.
3. Confirms details with the customer off-system, adjusts sizing, scope, terms and pricing.
4. **Send for approval**.
5. If returned, the approver's reason is shown at the top of the quotation.
6. Once approved, **Issue to customer**, then **Mark won** or **Mark lost**.

Sales can also invite a customer directly — Settings → Team & roles, role **Customer** — which is
how a named account gets in when public registration is off.

`GAP:` there is no queue view, no assignment, no SLA. Submitted enquiries sit in the main quote
list and have to be spotted.

### 3.3 The approver `LIVE`

1. Opens a quotation in *Pending approval*.
2. **Approve** — records who approved and when — or **Return for changes** with a reason.
3. Cannot be the same action as preparing: a salesperson looking at their own prepared quotation
   is offered no Approve button at all.

`GAP:` no notification. The approver has to go looking.

### 3.4 The engineer `LIVE`

1. Opens a project, works the **Design** and **Losses & degradation** tabs.
2. **Open 3D studio** — the parametric container assembly, carrying the project's configuration.
3. **Capture for offer** puts the assembly view on the quotation's cover page.
4. **Save to project** writes the studio configuration back.

`GAP:` the proposed additions — configure topology explicitly, select sourced equipment parameter
sets, compare scenarios side by side, and investigate which component is limiting a result. §12.

### 3.5 Sales and approver, with a simulation attached `GAP`

1. Sales attaches a **reviewed simulation snapshot** to an estimate. The snapshot is immutable and
   names its revision.
2. The approver reviews the exact configuration, its assumptions, its evidence badge and its
   revision history before releasing anything.
3. A design change after the fact **visibly invalidates** the quotation's assumptions and triggers
   review. Previous runs stay immutable; they are never edited in place.

A simulation never releases a quotation on its own, and modelled performance never becomes a
warranty. §16.

---

## 4. Screen by screen

### 4.0 The proposed screen map `GAP`

**Unchanged:** the landing (§4.1), the opening question (§4.2), the build sequence (§4.3), sign-in,
joining and the whole workbench. No stage in §17 modifies them.

**Learn — a mode inside `/app/studio`, three destinations, and no more.**

| Screen | Purpose | Users | Editable inputs | Outputs | States that must be designed |
| --- | --- | --- | --- | --- | --- |
| **Choose a lesson** | pick a lesson against this project | anyone who can open the project | none | question, outcome, duration | no project → offers the reference preset instead of an empty frame; failed load names the lesson and retries |
| **Simulation** | run it and watch | as above | ≤3 named controls with units | ≤4 metrics, ≤2 charts, stack, ergOS card, event log | loading (first solve), updating (input changed, last valid result retained and marked), stale, failed solve stated honestly |
| **What changed?** | compare two runs | as above | none | per-metric delta, cause, ergOS decision diff | needs two runs; says so rather than showing an empty frame |

PCS, BMS and EMS detail open as **contextual panels inside Simulation**, never as competing
top-level screens.

**Design / Engineering — progressive, not exposed by default.** Overview; Plant & 3D; Charge /
Discharge; jouleWise ergOS EMS; PCS; BMS; Thermal & Aging; Grid & Dispatch; Compare; Results &
Assumptions. The scenario is preserved when switching modes.

Every proposed screen owes, before it is built: purpose, permitted users, editable inputs **with
units**, outputs, controls, linked selections, explanations, validation, empty/loading/failed/stale
states, and a falsifiable acceptance criterion. A design change invalidates old results *visibly*;
previous runs remain immutable.

### 4.1 Landing — `/` `LIVE`

Dark, full-bleed, one accent.

- **Hero.** An isometric container assembles itself out of cells and wiring on a 2D canvas — cells
  settle, busbars run, the coolant loop closes, the shell draws, a scan passes. Then **BESS Studio**
  and *Your BESS design studio is here.* Reduced-motion users get the finished assembly at once.
- **Readout strip.** Four live figures from the reference enclosure.
- **Capabilities** — three cards.
- **Workflow** — four steps: define, engineer, price, issue.
- **Footer** — jouleWise credit and link.
- `/?build=1` opens the question immediately. This is where **New design** goes.

`ASK:` the marketing sections below the hero are thin. Do you want them to sell, or is this
effectively an internal tool with a front door?

### 4.2 The opening question `LIVE`

| Field | Options |
| --- | --- |
| Power | number + MW/kW toggle |
| Hours of discharge | 30 m, 1, 2, 3, 4, 6, 8, 12 h |
| Hours of charge | same |
| What is it for? | eight applications (§7.1) |

Live preview: usable energy, units × enclosure size, discharge/charge C-rate, power conversion.
Blocking warnings appear inline before you can continue.

### 4.3 The build sequence — `/start` `LIVE`

Five steps, ~2.2 s each, one continuous camera move over one scene. Skippable; reduced motion goes
straight through.

| Step | Shows | Headline figure |
| --- | --- | --- |
| 1 Duty cycle | the day drawn across an empty pad, charge blue, discharge green | MW at the point of connection |
| 2 Cells | the camera flies into one pack as its cells fill in | total cells, across N packs |
| 3 Enclosure | racks, busbars, coolant loop and shell close around that same pack | MWh per enclosure |
| 4 Plant | the fleet and its conversion land beside it | enclosures · MWh installed |
| 5 Costing | a commissioning sweep over the finished yard | day-one capital cost |

Every figure is read from the same sizing and finance result being written to the workspace while
it plays. The workbench opens when both have finished. Above 18 enclosures the yard draws 18 and
says so.

### 4.4 Sign-in — `/sign-in` `LIVE`

Split screen: dark brand panel left, form right. Email/password, Google, and **Open the demo
workspace** — which runs entirely on local storage and touches nothing in Firebase.

This form opens a **new supplier workspace**. It is not the way a customer arrives; that is §4.5.

`GAP:` no password reset.

### 4.5 Joining — `/join` and `/register` `LIVE`

One screen, two doors, because the shape is identical: look up what is being joined, say plainly
what it means, then sign in or create an account and write the membership.

**`/join/?org=…&token=…`** — accepting an invitation. Shows which workspace, which role and what
that role can do, and who invited you. The email is fixed to the invited address and cannot be
edited. A link that is invalid, withdrawn, already used or expired says which, rather than failing
silently. Someone already signed in joins on arrival without a form.

**`/register/?org=…`** — customer self-registration, only where the workspace has enabled it.
Refused with an explanation otherwise. Produces the `customer` role and no other.

Both note that pricing appears once the email address is verified, so the gate is not a surprise
later.

**Settings → Team & roles** holds the other half: create an invitation, copy its link, see its
state — pending, accepted, revoked, expired — and revoke it. Plus the switch that opens the
workspace to public customer registration, off by default, with the registration link to publish
and the environment variable to set.

### 4.13 Queue and notifications — `/app/queue` `LIVE`

**Queue.** Staff only, and only roles holding `quote.prepare` — sales, approver, admin, owner. An
engineer sizes and does not price, so they get no queue, which is the role model working rather than
an omission. Two tiles (waiting, in hand), then **New enquiries** oldest first with how long each has
waited, then **In hand**.

**Notifications.** A bell in the top bar with an unread count. Items are *derived* from the
quotations already being watched, not stored — no extra collection, no extra reads, nothing that can
go stale. Only `notificationsSeenAt` on the member document is written, and only when the panel is
opened.

Staff are told: an enquiry was submitted; something awaits their approval (approvers only); an
approver returned something, with the reason. A customer is told only that their own formal
quotation was issued — never about their own submission, and never anything carrying another
customer's name.

### 4.5b First run — an empty workspace `LIVE`

A real organization starts **empty**. Seeded reference records belong to the demonstration
workspace only; a supplier signing up used to be handed five fictional customers carrying crores of
invented pipeline, which is a mess to clear up rather than a demonstration.

Each list distinguishes *nothing yet* from *nothing matches*, because telling a first-time user to
adjust a filter they never set is how an empty workspace reads as a broken one:

| Page | Nothing yet | Nothing matches |
| --- | --- | --- |
| Dashboard | *Your workspace is empty* → **Add a customer** | — |
| Customers | *No customers yet* → **Add the first customer** | *No customers match* → **Clear the filter** |
| Projects | no customers: *A customer comes first* → **Add a customer**. Customers but no projects: *No projects yet* → **New project** | *No projects match* → **Clear the filter** |
| Quotes | *No quotations* → **Go to projects** | — |
| Queue | *No enquiries waiting. Submitted designs appear here the moment a customer sends one.* | — |

### 4.6 Dashboard — `/app` `LIVE`

Staff only; customers get a reduced *Overview*.

- Four tiles: open pipeline, won, fleet under quote (MWh + MW + enclosures), active customers.
- **Sales funnel** — quoted value by customer stage.
- **Quote value by status** — composition bar, won first.
- **Projects by application** — bar chart.
- **Recent quotations** and **Activity** (last 120 entries).

### 4.7 Customers — `/app/customers` `LIVE`

**The stage follows the work.** It used to be set to `lead` at creation and never written again, so
the dashboard funnel read a field nothing moved. Saving a quotation now restages its customer:

| Their quotations | Stage |
| --- | --- |
| one being worked on — draft, submitted, in review | **qualified** |
| a price in front of them — awaiting approval, approved, issued | **proposal** |
| one won | **won** |

Two rules keep it out of a salesperson's way. **It only advances** — somebody moved forward by hand
is never dragged back because a quotation is still a draft. And **it never decides `lost` or
`negotiation`**: neither is inferable, a lost quotation may be one of several, and a negotiation
happens on the telephone. Both stay a human judgement, and a customer marked lost stays there unless
they win something.

Staff only. List with segment, stage, owner, project and quote counts. Detail holds contacts,
country/city/website, notes, and the customer's projects and quotations.

### 4.8 Projects — `/app/projects` `LIVE`

**New project** on the list, against any customer; the same action is on the customer page. A
project can be **moved to another customer** from its header — the opening question parks every
anonymous design on one holding account, so without this the second one raised there is stuck with
the first one's name. Quotations keep their own customer snapshot and the move says so, because an
issued offer must not change when a record is tidied up afterwards. **Delete** warns about
quotations that would be left pointing at nothing.

The core screen. Four tiles across the top — rated power, contracted usable, installed DC,
delivered equipment price — then five tabs.

**Requirements** — application preset and its commercial risks; sizing mode (power × duration, or
usable-energy target); rated power; duration; hours allowed to charge; cycles per day; operating
days per year; depth of discharge; availability; site location; ambient temperature; altitude;
enclosure; power conversion; step-up transformer; grid voltage; power factor; project life;
capacity maintenance strategy.

**Losses & degradation** — usable DC window; charge and discharge DC efficiency; DC cable, PCS,
AC cable and transformer losses; auxiliary consumption; wheeling losses; dispatch availability.
Then the explicit chain: stored DC energy → usable at AC → delivered → charging energy → required
at the generation end. Degradation basis is either the supplied 20-year table or the modelled
curve, with all 21 anchors editable.

**Design** — what the sizing produced: units, racks, packs, cells, strings, DC window, footprint,
mass, conversion count, augmentation schedule.

**Performance & ageing** — usable energy over the project life against installed nameplate;
capacity retention against the supplied curve; annual energy discharged, with augmentation years
marked.

**Economics** — LCOS, NPV, IRR, annual gross benefit; cumulative cash position; annual net cash
flow; full cash-flow table.

Every control is a slider with a typed value beside it. Edits commit on idle or blur, not per
keystroke.

### 4.9 Quotes — `/app/quotes` `LIVE`

Tiles: quotation number and status, customer, total, valid until. Lifecycle buttons come from the
shared state machine, so the interface never offers a step the rules would refuse.

**Pricing** — line items by category, quantity, unit price, total, optional flag. Lines can be
added, renamed and removed; a hand-added line carries no provenance and is priced by hand. Discount,
tax, freight. **Changing the currency converts every amount** at the price book's own rate, so the
quotation still reconciles with the build-up that produced it.

**Status is read-only.** The lifecycle actions in the header are the only way a quotation moves.

**Scope & terms** — included, excluded, assumptions, incoterms, payment terms, delivery weeks,
warranty years, validity.

**Offer content** — the narrative on the offer document.

**Offer document** — the four-page A4 proposal (§6).

**One-page summary** — condensed proposal.

Exports: JSON, standalone offer HTML, print to PDF.

### 4.10 Catalogue — `/app/catalog` `LIVE`

Read-only reference: cells, packs, power conversion systems, transformers. Each row carries its
provenance — `supplied`, `indicative` or `assumed` — so an assumption is never mistaken for a
datasheet figure.

### 4.11 Settings — `/app/settings` `LIVE`

Organization identity and branding, with a live preview of what the customer sees. Landed cost
build-up. Commercial rates. Direct equipment rates. Services, operations and energy. Members and
what each role can do. Deployment notes.

### 4.12 3D Studio — `/app/studio` `LIVE`

See §5. `/studio` redirects here.

---

## 5. The 3D studio

### 5.1 Today `LIVE`

A parametric container assembly in three.js, lazy-loaded so the first page of the site stays light.

**Layout.** Project explorer left (assembly tree down to individual packs, and a visibility tab);
canvas centre; component inspector right; statistics strip below.

**Views.** Isometric, top, front, side, reset. Orbit, zoom, pan.

**Dimensions.** The dimension layer measures the three axes of whatever is in view with an offset
run, end ticks and a value — millimetres at component scale, metres once a plot or a container is
in view. At container scope it measures the enclosure rather than the drawn bounds, so the figure
on the canvas is the one the inspector reports.

**Scene controls.** Roof off · cutaway · explode (0–100 %) · electrical path · cooling path ·
section · guided walk.

**Section.** A clipping plane through whatever is on screen, on any of the three axes. The control
speaks in fractions of the current bounds, so the same slider cuts a cell, a container and a site.
Labels are filtered by the same rule as the geometry, measured from the point the eye judges each
component by — a rack and a pack sit on their base, a cell on its centre — so a component that is
no longer drawn does not keep its name floating in space. The plane is a way of looking at the
design rather than part of it, so it lives beside the camera in session state and never reaches a
saved configuration. The two path traces are exclusive: the electrical one follows one string, because a
string is a series path; the cooling one follows the whole loop, because a loop is one circuit
through every rack. A traced run is drawn thicker so it can be followed at container zoom.

**Guided walk.** Narrated steps down to a single cell and back out through the electrical path —
container, banks and aisle, string, pack, how the heat gets out, cell, path out, preceded by the
site where the project buys a fleet. The narration runs as a strip across the foot of the canvas,
inside the room the camera already leaves for the overlays, so it never covers the model. Each step sets the
view (roof, walls, lids, routing, explode, highlight) and narrates it with the figures the current
design produced, so a different topology narrates differently. Auto-advances with a progress bar;
pauses; steps with the arrow keys; leaves on Escape. Manual from the start for anyone who has asked
for reduced motion. Leaving restores the visibility, explode and highlight settings that were in
place beforehand.

**Inspector.** System overview — topology preset, cell equivalent, operating voltage, aggregate
capacity, string current, nominal duration. Calculated DC performance. Dimensions. Cooling and
controls — cold plates, dry-break ports. Protection — combiner, external PCS. Input provenance,
including any discrepancy between sources.

**Site view.** Where a project needs more than one unit, the studio lays the fleet out at the
selected product's own catalogue dimensions — including the three systems whose interiors are not
modelled, so a site of 1.4 m cabinets is not drawn as a site of containers. Units stand in rows at
3 m separation with 6 m access roads between rows, the converters and transformers sit in their own
bay off one end, and the fenced plot is sized around the lot. Where the augmentation schedule adds
units later, their pads are laid out and reserved from day one — the fence goes up once, so the
plot is leased for the fleet the project ends with, not the one it starts with. Where the studio's assumed mechanical
clearances need a bigger envelope than the product's stated dimensions, the inspector says so and
says which of the two is the assumption. The field is proportioned toward
a square rather than a single long line. The explorer lists the units and the conversion kit, the
statistics strip speaks for the fleet, and double-clicking a unit steps inside it. A unit is drawn
as a shell, not as 4,992 cells, so a twenty-two unit site stays under a thousand boxes.

**Assumptions.** Every input in the Configure tab — the fifteen mechanical assumptions, the three
equipment ratings and the five usable-AC figures — explains itself as it is edited — what
it is, where the figure came from, and what moves in the container when it changes. A test reads
the assumption keys out of the schema and fails if one has no explanation, or an explanation has no
assumption.

**Learn.** A tab that explains whatever is selected — site, container, string, pack, cell or
ancillary:
what it is, the engineering reasoning in plain English, the numbers that follow from this design,
and what moves if it changes. Every figure is read from the live model. A ladder at the foot of the
panel moves between scales.

**Validation.** Live warnings against the equipment window of the converter the project selected —
for example *maximum voltage exceeds equipment limit, 1,518.4 V max / 1,500 V equipment*, which is
a finding of the supplied data: the reference container's string reaches 1,518.4 V at full cell
voltage and every converter in its class stops at 1,500 V. Each finding opens for what it means and
what to do about it.

**Project limits.** Opening a project carries its converter's DC window, current share per
enclosure, loss chain and auxiliary load into the studio, and the toolbar names what the design is
being checked against. Without a project the studio shows the reference assembly.

**Exports.** PNG at chosen resolution · JSON configuration in and out · component schedule CSV ·
assembled model GLB · device performance profile.

**Project integration.** A project picker in the toolbar moves between the reference assembly and
any project in the workspace. Where a project needs more than one unit, the explorer says which of
the fleet is drawn. **Capture for offer** puts the current view on the quotation cover. **Save to
project** writes the configuration back.

**Branding.** The container flank, the PNG header, the logo upload, the GLB metadata and every
export filename follow the organization's branding.

### 5.2 Proposed: the real hierarchy, and one clock `GAP`

`TODO:` represent the **actually configured** hierarchy rather than a fixed picture:

> cell → module or tray → rack/string → DC bus → PCS block → transformer → switchgear → point of
> connection

Do not assume racks are always parallel, or that every container has one PCS. Series and parallel
connections are modelled explicitly, and voltage, current, capacity and equipment compatibility are
validated against them.

**3D becomes optional.** The default is one clear plant view with a simple energy-flow overlay; a
lesson can be completed without ever opening 3D. External, cutaway, exploded, single-line and
inspection views arrive in progressively deeper modes.

**One simulation clock** drives the 3D scene, the single-line diagram, the charts and the event log.
Play, pause, reset, step, scrub, playback speed.

- **Playback speed never alters the numerical integration step.** Scrubbing replays recorded state;
  it does not change physics.
- **Editing an input creates a new run, or an explicitly marked branch** from a saved state.
- **No decorative random telemetry.** Every moving number resolves to the run.

Selecting a component links its physical location, electrical connection, parameters, charts and
events. Electrical paths, cooling paths and control communications are visually distinct. A
readable 2D fallback, keyboard operation and reduced-motion mode are requirements, not extras.
Exported presentation images carry scenario, timestamp and simulation status.

`ASK:` this is the most impressive part of the product and the least connected to the sales
conversation. What should a customer be able to do here, versus an engineer?

*Recommendation:* customers get the default plant view, energy-flow overlay and component
inspection read-only; engineers get cutaway, exploded, topology editing and export. Rationale: the
3D earns its keep in a demo, and demos are run for customers — but topology editing is where an
unqualified change becomes a wrong quotation.

---

## 6. The offer document

Four A4 pages, print-to-PDF from the browser, laid out to the issued Solarworld proposal. Measured
to fit exactly — an on-screen badge warns if content overflows a page.

| Page | Content |
| --- | --- |
| 1 | Cover — title, capacity, hero figures, captured assembly view, why Solarworld, proposal details |
| 2 | Technical — specification tables, enclosure diagram, performance |
| 3 | Commercial — price build-up reconciling to the order value, scope, terms |
| 4 | Close — validity, assumptions, acceptance block, qualification |

Carries the organization's branding. jouleWise credit is a tenant setting.

`GAP:` the proposed **engineering appendix** — optional, concise, attached to the offer: nominal and
usable energy, the AC power boundary, achievable duration under the stated scenario, operating
window, equipment availability, losses, the model evidence badge and the model's limitations. §16.

---

## 7. What the numbers come from

### 7.1 Applications

C&I peak shaving · wholesale energy arbitrage · frequency regulation / FCAS · solar shifting /
RE firming · backup / UPS resilience · microgrid / diesel offset · EV charging buffer ·
grid-forming / inertia.

Each sets duration, cycles per day, days per year, depth of discharge, availability, augmentation
strategy and revenue basis, and carries its own commercial risks to raise.

### 7.2 Catalogue

Real product family: SB12100 4S, SB24100 8S, SB51100 16S, SB51314 16S, SB166314 52S, SB332314 104S.
Enclosures from 16 kWh cabinets to the 5.016 MWh 20-ft liquid-cooled container
(`SWESLC1331.2V314Ah`). Conversion from 5 kW hybrid to 5,000 kW central.

### 7.3 Sizing

Fleet size is `max(energy need, power need)` — a C-rate ceiling is a constraint, not a warning.
Cohort-based degradation with augmentation scheduling. Explicit loss chain. Charge-window
feasibility. Cell temperature from ambient and cooling strategy, Arrhenius ageing.

### 7.4 Cost

Landed build-up: FOB → ocean freight → CIF → FX → customs duty → inland clearance → delivered,
plus conversion. The offer's own exchange rate governs the quotation, so the build-up reconciles
to the order value.

### 7.5 Proposed simulation engines `GAP`

Everything in §7.1–7.4 is a **sizing** calculation: it answers how big, not what happens minute by
minute. The proposal adds a time-stepping simulation alongside it, with one authoritative owner per
state and per loss term. See §13 for the architecture and the library boundaries, and §14 for what
must be proved before a number is shown.

The two must never silently disagree. Where the sizing engine and the simulation both produce a
figure — usable energy, achievable duration, round-trip efficiency — the boundaries are stated and
reconciled, or the figures are not placed side by side.

### 7.6 Validation

Reproduces the supplied workbooks to within 0.004 % on energy and to the rupee on landed cost
(₹41,022,014.6125 at $68/kWh; ₹5,820,847,958 for the issued 350 MW proposal at $69/kWh). Locked by
tests.

---

## 8. Design language

Near-black surfaces (`#08090B`, panels `#0E1116`), hairline rules, square corners, uppercase
monospace captions, Solarworld green `#93BE49` as the single accent. One language across the
landing, the build sequence, the workbench and the 3D studio.

Printed documents keep their own light tokens — the workbench theme cannot reach into a page going
to a customer.

Charts use the deck hues stepped for the dark surface and validated there for lightness, chroma,
colour-vision separation and contrast. The palette order is what carries that safety, so slots are
consumed in order.

---

## 9. Running and deploying

```bash
npm install
npm run dev         # http://localhost:3400
npm run test        # 103 tests — engines, access rules, lifecycle, invitations
npm run test:rules  # 35 tests — the Firestore rules, against the emulator
npm run emulators   # the emulator on its own, with the UI at :4000
npm run login && npm run deploy   # → https://bessstudio-e55e1.web.app
```

`test:rules` needs Java, which the Firestore emulator runs on. It starts the emulator, runs the
suite against the real rules engine and shuts it down.

Firebase Spark (free): Hosting, Auth, Firestore. No Cloud Functions, no Cloud Storage.

Multi-tenant Firestore: everything under `organizations/{orgId}/…`, so authorisation is one
membership check per path.

---

## 10. Known gaps

Ordered by how much they block the workflow above.

1. **Invitations are sent by hand** `PARTIAL` — no mail server on the Spark plan, so the link is
   copied to the clipboard for the inviter to send. Automatic mail needs Cloud Functions, which
   needs the Blaze plan.
3. **Notifications are in-app only** `PARTIAL` — a derived bell and unread count (§4.13). No email;
   that needs a mail sender the free plan does not have.
4. ~~No sales queue~~ `LIVE` — `/app/queue`, oldest first, with waiting time (§4.13).
5. ~~No password reset~~ `LIVE` — on the sign-in form.
6. **`NEXT_PUBLIC_PUBLIC_ORG_ID` must be set** before "Create an account" appears on the sign-in
   page. Until then a customer needs an explicit `?org=` link, which Settings provides.
7. **Offer document is single-template** `PARTIAL` — no per-tenant layout variation.
8. **Activity trail reads 120 entries** — deliberate, to stay inside the free tier.

---

---

# The proposal

**None of what follows is built.** Sections 11–20 are a specification and a gated build plan. Every
capability is `GAP` until a stage in §17 is `ACCEPTED` and the feature is actually available.

---

## 11. Where jouleWise ergOS sits

`GAP` — proposed. The product name is **jouleWise ergOS EMS**, used exactly. Solarworld or tenant
branding stays on the plant; jouleWise is identified on its EMS layer, not in place of the tenant.

### 11.1 The stack

| Layer | Its role, in plain language | What the user sees |
| --- | --- | --- |
| User / site objective | defines the goal: lower peaks, use solar, preserve backup, follow a schedule | the selected objective and a simple target |
| **jouleWise ergOS EMS** | supervisory energy management: decides *when* and *how much* charge or discharge to request, under the selected policy | inputs, decision, reason, requested power |
| PCS | converts AC/DC and executes feasible commands | requested versus achieved power, conversion losses, its own limits |
| BMS | monitors battery condition; defines permissions and protection limits | available charge/discharge limit, permission, and why it is restricted |
| Battery and site equipment | stores and delivers energy; supplies the physical response | SOC, energy flow, temperatures, meter feedback |

**The diagram must distinguish three different things**: supervisory commands, telemetry, and
electrical energy. **ergOS is never drawn as a device that battery power flows through.** BMS limits
feed the PCS and inform the EMS; site-meter, PCS and battery telemetry return to ergOS.

Selecting any layer answers two questions: *what does this do?* and — just as important — *what does
it not control?*

**The relationship, stated precisely:** ergOS requests dispatch; the PCS executes within its own
limits **and** within the BMS permission and current envelope; actual power and status feed back to
ergOS. **BMS protections are independently authoritative.** They are not a sequential approval step
after the PCS has acted.

### 11.2 What may and may not be claimed

ergOS is jouleWise's EMS. Its actual algorithms, supported interfaces and production features
require repository or product-document evidence that this project does not yet have. Until then,
everything here is labelled **"ergOS EMS — educational simulation"**.

Not claimed, in the interface or anywhere else: a live connection, a shipped optimisation
algorithm, real production firmware, or digital-twin validation. **No educational control ever
sends a command to physical equipment.**

### 11.3 Making the decision visible

A deterministic supervisory policy per lesson, using only what it needs: site load, solar
availability, an optional illustrative tariff schedule, SOC and reserve, PCS availability, BMS
limits. Transparent rules first. Optimisation and forecasting are optional engineering extensions,
not the starting point.

The always-visible **ergOS is deciding** card carries five things:

- **Goal** — what this lesson is trying to achieve.
- **Observed** — a short description backed by the current run.
- **Action** — charge, discharge, hold, or reduce the request.
- **Requested / delivered** power, and any active limit.
- **Reason** — one plain sentence. **Why?** opens the underlying rule and its values.

> *"Site demand is above your target. ergOS requests discharge to reduce grid import. The battery
> reserve limits how long this can continue."*

Actual run values substitute in. **No telemetry is ever hard-coded.**

The EMS setpoint cadence is distinct from battery integration and from rendering. Stale telemetry,
command acknowledgement, communication timeout and fallback policy belong to the documented
component configuration — there is no universal response and none will be claimed.

### 11.4 Showing the EMS contribution fairly

Where a lesson supports it, offer **Fixed schedule** versus **ergOS educational policy** on
identical initial state, equipment, load, solar, tariff and constraints. **Both retain PCS limits
and BMS protection.**

There is no "EMS off" baseline that disables safety or invents irrational dispatch to flatter the
comparison. Compare only what is relevant: peak grid import, solar self-consumption, delivered
energy, reserve remaining, curtailed energy, illustrative cost.

**Report equal, worse or infeasible outcomes honestly.** If ending SOC differs between the two runs,
disclose it and reconcile the stored-energy value before attributing any cost benefit — otherwise
the comparison is measuring a fuller battery, not a better policy.

No commercial savings are promised, and the educational policy is never presented as the verified
production ergOS algorithm.

---

## 12. The simulation model

`GAP` — proposed. Fidelity boundaries are stated per subsystem; anything outside them is marked and
not manufactured.

### 12.1 Charging

Configure: initial SOC and temperature, chemistry and parameter set, pack topology, available source
power, grid-import limit, charge target, schedule, ambient conditions, cooling capacity, equipment
limits.

Support constant-current and constant-power requests, and a parameterised voltage-limited taper
where the product supports one. **No universal charge curve is imposed on every product.** Plant AC
power control, battery DC current and cell voltage are three different quantities and are labelled
as such.

Show: requested versus achieved power, AC import, PCS DC output, battery current and voltage, SOC,
highest cell voltage, temperatures, losses, cooling demand, accumulated energy, time to target. The
time estimate reflects taper, changing limits and source availability; **extrapolated estimates are
labelled**.

Name the binding constraint, every time: source availability, site import limit, PCS capability, BMS
charge-current limit, cell voltage, temperature, or target SOC. When a request is infeasible, show
what *is* achievable alongside what was asked for.

### 12.2 Discharging

Constant power, load following, scheduled dispatch, peak shaving, and an educational backup
scenario. Inputs: reserve SOC, minimum cell voltage, load profile, requested duration, ambient
temperature, available equipment.

Show: net AC delivery **at the connection point**, DC withdrawal, current rising as voltage falls
under constant power, minimum cell voltage, SOC, thermal derating, auxiliary consumption, unmet
load, actual achievable duration. **Every MW and MWh figure names its boundary.**

Three things the lesson must make a user understand:

- why nominal energy, usable DC energy and net delivered AC energy are three different numbers;
- why a nominal duration may not be achieved;
- why adding energy capacity does not necessarily add PCS power.

### 12.3 PCS behaviour

A documented, averaged converter model: AC/DC conversion, directional efficiency maps, DC operating
window, AC current limits, active and reactive power commands, apparent-power capability, ramps,
standby consumption, temperature-dependent derating, availability, trips.

Display requested and achieved P and Q, the operating point on the capability plot, DC and AC
voltage and current, losses, operating state, and the active limitation.

**Enforce P² + Q² ≤ S² *alongside* voltage, current and manufacturer-specific limits. The capability
circle alone is insufficient** — a real converter is often bounded tighter by current at low voltage.
Active/reactive priority is explicit and configurable within what the equipment supports.

Grid-following operation is separate from any proposed grid-forming educational model. Islanding,
black start and droop must be explicitly supported by the configured equipment and the model.

> **Ordinary power flow cannot validate transient stability, switching waveforms, harmonics or
> protection timing.** These are `GAP`. Plausible-looking waveforms will not be manufactured to fill
> the space.

States: standby, precharge coordination, ready, charging, discharging, derated, faulted, recovery —
each identifying which subsystem owns the transition.

### 12.4 BMS behaviour

An explicit supervisory state machine: per-cell or representative-cell signals, rack aggregation,
measured versus simulated true SOC, voltage and temperature extrema, charge and discharge current
limits, balancing, contactor commands, alarm escalation, fault latching, reset criteria.

Cover over- and undervoltage, charge and discharge overcurrent, temperature limits, sensor faults,
communication loss, insulation-monitor alarms, contactor faults. Thresholds, delays, hysteresis and
event ordering are configurable with stated provenance.

**Educational fault injection is a simulated input**, not a claim to physically model every fault
mechanism.

What a user must come away understanding: why a healthy *average* pack SOC does not override one
limiting cell; why balancing is slow; why a BMS reduces power *before* it trips.

Passive and active balancing are distinguished, with supported balancing current and its energy
consequence modelled. SOC starts as transparent Coulomb counting, with drift explained; anything
more advanced needs a specified estimator and validation. **Inferring LFP SOC from voltage alone is
explained as the limitation it is.** A generic BMS is never presented as vendor firmware or as a
safety certification.

### 12.5 Thermal, aging and grid

Couple battery losses, thermal mass, ambient conditions, cooling capacity and auxiliary power at the
supported fidelity. Representative-cell versus spatially resolved temperature is stated honestly.
**A cooling failure demonstrates the modelled temperature and derating response — not fabricated
thermal-runaway propagation.**

Separate SOC from SOH, capacity fade from resistance growth, calendar aging from cycle aging.
Expose the temperature, operating-SOC and cycling assumptions. **Degradation is not double-counted
across engines.** Lifetime results are model-dependent estimates with sourced parameters and
sensitivity scenarios.

For grid studies: time-series load and source profiles, import/export limits, transformer loading,
voltage and reactive-power requirements at the modelled level. Compare scheduled against achieved
dispatch, curtailed energy, unmet commitments.

Economics use **net achievable dispatch**, including charging energy, losses and auxiliaries,
counted once. **Do not multiply annual cash flow by a second round-trip efficiency if those losses
are already in the dispatch** — a live trap given §7.4 already handles losses in the sizing engine.

---

## 13. Simulation architecture and libraries

`GAP` — proposed. Versions, compatibility, maintenance status and licensing must be verified against
current official documentation at implementation time. **No library is called "the most accurate"
without a relevant benchmark.**

| Component | Proposed tool | The boundary it must respect |
| --- | --- | --- |
| Interactive battery electrical/thermal response | PyBaMM Thevenin equivalent-circuit | Fast default. Requires explicit calibration and pack aggregation. |
| Advanced battery physics | PyBaMM SPM / SPMe / DFN, where justified and supported by the parameter set | Optional, asynchronous studies. Not a plant controller, not an automatic vendor model. |
| Long-horizon performance and dispatch | NREL PySAM Battery, assessed for the use case | A separate annual/lifetime pathway. Assumptions reconciled before any comparison. |
| AC network power flow | pandapower | Steady-state only. The orchestrator updates SOC and enforces equipment constraints. |
| ergOS educational EMS policy | explicit deterministic supervisory model; a real ergOS adapter only once verified | Owns dispatch requests and explanations. Not battery physics, not BMS protection. |
| PCS and BMS coordination | explicit application models | Owns state machines, controls and limits. No library provides a complete BESS control stack. |

### 13.1 Ownership, coupling and the trap to avoid

**One authoritative owner for each state and each loss term.** PyBaMM and PySAM must never both
update the same battery state — that is the single most likely way this architecture produces
confident nonsense.

Define, before implementation: coupling order, event handling, and convergence for BMS limits, PCS
response, battery state, thermal state and grid constraints. **Explicitly prevent a one-step
overshoot from hiding a protection-limit violation** — a solver that steps past a cell-voltage limit
and returns a legal-looking endpoint has silently broken the thing the model exists to show.

### 13.2 Records

Versioned, each with units, sign conventions, chemistry, data source, applicability range,
provenance status, model and library versions, solver settings, random seed where applicable, and a
configuration hash:

`EquipmentParameterSet` · `PlantConfiguration` · `LearningTemplate` · `EMSPolicy` · `Scenario` ·
`SimulationRun` · `TimeSeriesResult` · `EMSDecisionLog` · `EventLog` · `ValidationReport`

A `LearningTemplate` pins the initial state, profiles, equipment parameters, allowed controls,
policy, learning objective and expected qualitative outcomes. An `EMSDecisionLog` records
observations, policy version, requested action, applied limits, achieved response and explanation
references.

### 13.3 Sign conventions

One application-wide power sign convention, with a **tested adapter per library**. In particular:
**pandapower storage uses positive power for charging** — the opposite of the convention most people
assume. Reactive-power direction is labelled too.

Never silently mix watts with megawatts, Ah with MWh, or cell parameters with pack parameters. §18
F02 and F05 exist specifically to catch this.

### 13.4 Deployment

Keep the existing React frontend and the verified application stack. Add a **Python simulation
service** with a typed API, asynchronous jobs, cancellation, progress, reproducible result storage
and caching of identical runs.

**Decided: a Google Cloud VM**, using the existing Terraform environment rather than adding a new
hosting product. The Python service runs there; the React frontend keeps its current deployment
until the migration is planned.

`GAP:` **the Terraform environment is not in this repository and is not in my possession.** I
searched for `*.tf`, Dockerfiles and Cloud Build config and found none, and I have no record of
writing one in this session — it is presumably in another repository or another session. Before S2,
point me at it: repository, path, the VM's shape, and whether the frontend moves with it or stays on
Firebase Hosting. Until then the deployment target is named but not specified, and no stage depends
on it.

---

## 14. Accuracy and evidence

`GAP` — proposed. Three badges, describing **parameter evidence**, not implementation status. A
model's operating range and validation limits stay visible alongside the badge.

| Badge | Means |
| --- | --- |
| **Illustrative parameters** | plausible teaching values. Not a product specification. |
| **Published-source parameters** | from a cited public source, with its applicability range. |
| **Validated against equipment data** | compared against measured data for *this* equipment, with a review date. |

Modelling LFP requires a compatible LFP parameter set. **Another chemistry is never relabelled.** A
missing parameter produces a visible assumption, an explicitly illustrative preset, or a blocked
high-confidence result — never a quiet default. Parameter import carries provenance review without
exposing restricted vendor data to unauthorised users.

**Round-trip efficiency is reported only from a complete controlled cycle** with comparable starting
and ending stored energy and thermal conditions. RTE from an arbitrary partial discharge is
meaningless without stating the accounting, and will not be shown as though it were not.

Numerical tolerance and physical predictive accuracy are different things and are reported
separately. **No universal error percentage is promised.** A solver failure produces a clear failed
or partial result — never a fabricated success.

### 14.1 Validation cases, defined before implementation

With justified pass/fail tolerances **per fixture and model** — tight numerical agreement for exact
arithmetic, justified solver and conservation tolerances for differential models, empirical error
against equipment data recorded separately. No blanket tolerance across all calculations.

- Analytic idealised SOC and energy with losses disabled.
- Series/parallel aggregation and topology compatibility.
- Charge/discharge reversal and sign adapters.
- Matched-boundary energy accounting — auxiliaries and conversion losses counted **exactly once**.
- SOC, voltage, current, thermal, PCS and grid limits, **including event-boundary overshoot**.
- BMS hysteresis, delay, latching, reset, and simultaneous faults.
- Reactive-power headroom reducing active-power availability.
- ergOS policy requests respect reserve and site constraints, with achieved power still bounded
  independently by PCS and BMS limits.
- EMS explanations match the recorded inputs and active rules **at the selected timestamp**.
- Every template loads into a valid state, resets reproducibly, keeps controls in compatible ranges.
- Policy comparisons hold plant conditions identical and disclose ending-SOC differences.
- Timestep convergence and reproducible reruns.
- Comparison against measured charge/discharge and thermal data where available.
- Cross-engine comparison **only** with aligned assumptions, boundaries and applicable models.

---

## 15. The lesson catalogue

`GAP` — proposed. Seven ready-to-run cards, reached from a project or quotation (§3.0), not from the
landing page.

**Charge and discharge** is the recommended first lesson. Each card states one question, the
expected learning outcome, and a short estimated duration — 2–5 minutes to explore, with a simulated
day playing back in under a minute **without changing solver accuracy**.

A single consistent, clearly illustrative LFP plant preset runs the starter lessons, with a
separately parameterised lead-acid branch for the UPS chemistry comparison. Users enter no cell,
inverter or solver data. Nominal MW/MWh and SOC appear as plain-language facts; detailed assumptions
sit behind **Inspect model**. **The preset is never implied to be a real Solarworld product
specification.**

| # | Lesson | Question it answers | Beginner controls (max 3) | ergOS role | Main observations |
| --- | --- | --- | --- | --- | --- |
| 1 | **Charge and discharge** | Where does energy go, and why does SOC change? | direction; power level; starting SOC | relay the request within constraints | energy direction, SOC, requested/achieved power, losses |
| 2 | **Reduce the evening peak** | How does storage cut grid demand? | peak target; initial SOC; reserve | request discharge above the import target | site load, grid import, reserve limitation |
| 3 | **Use more solar** | Why charge at noon and discharge later? | solar preset; load preset; reserve | absorb surplus, serve later demand | solar flow, self-consumption, remaining grid demand |
| 4 | **Keep backup ready** | Why stop selling energy while charge remains? | reserve level; outage timing; critical load | preserve reserve, dispatch during the outage | available backup energy, served/unserved load, duration |
| 5 | **Follow a price schedule** | Why does charging timing matter? | price preset; reserve; initial SOC | follow a transparent price-window rule | timing, losses, illustrative cost comparison |
| 6 | **When the battery says slow down** | Who wins when a request exceeds a limit? | normal/hot/weak-cell preset; requested power; initial SOC | request and revise using reported availability | BMS permission, PCS limit, actual response, limiting component |
| 7 | **UPS support by contract demand** | How much protected power and energy does my site need? | contract-demand preset; protected-load share; backup duration | preserve reserve, supervise readiness, schedule recharge | required kW/kVA, predicted runtime, load served, interruption requirement |

For lesson 4, island-capable PCS, transfer equipment and a simplified supported transition model are
**preconfigured**. Sub-cycle transfer behaviour and black-start validation are explicitly out of
scope. **A generic grid-following inverter does not magically energise an island.**

Tariffs, weather and profiles in lessons are illustrative fixtures unless a sourced dataset is
explicitly selected. Lessons need no external data connection. **Savings shown are scenario
outcomes, not offers.**

### 15.1 The lesson loop

**choose → play → change one thing → compare → understand**

1. Load the complete scenario; show a one-sentence goal.
2. Offer Play immediately. Sensible defaults, no configuration wizard.
3. Animate energy flow on a compact clickable battery / PCS / BMS / ergOS stack.
4. Show at most **four** headline metrics and **two** synchronised charts.
5. Explain one current cause, through the ergOS card and an active-limit highlight.
6. Let the user change one of at most **three** controls, then replay **from the same initial
   state** so the comparison is fair.
7. **What changed and why?** Then Reset, Next lesson, or take it back to the design.

Advanced faults, topology editing, degradation, reactive-power studies and solver settings live
behind **Explore deeper**. Jargon is taught on first use — the default label is "Battery charge
level (SOC)", not "SOC". **No quiz and no tutorial gate before interaction.**

The interface uses **actual model outputs**. Checked precomputed runs may speed the first playback
if clearly identified, but a changed input must run, or retrieve the exactly matching scenario.
While computation is pending the last valid result is retained with an explicit updating state.
**An animation is never substituted for a simulation result.**

### 15.2 Deeper lessons

A secondary catalogue, not additional onboarding choices: same energy with different PCS power;
additional parallel capacity; charging taper; constant-power current rise; cooling failure; weak-cell
limitation; reactive-power headroom; an unavailable rack or PCS; aging; reserve tradeoffs; full-cycle
loss accounting.

Each needs a learning objective, a fixed parameter set, permitted controls, an expected qualitative
outcome, an evidence-linked explanation and a **falsifiable** acceptance criterion. Every displayed
number resolves to the current run, a sourced parameter, or a clearly identified illustrative
assumption.

### 15.3 UPS support, sized from contract demand

Contract demand is **a starting estimate of site demand** — not a measurement of critical load, and
not automatically the required UPS rating. Results are labelled **"Indicative sizing from contract
demand"** until a measured load profile or an approved protected-load schedule replaces the estimate.

**Three beginner controls:**

1. **Contract demand** — 100, 250, 500, 1,000, 2,000, 5,000 kVA, plus custom with explicit kVA/kW
   selection. Illustrative site sizes, not product SKUs.
2. **Load to protect** — 25 / 50 / 75 / 100 % of estimated site real power. Default 50 %. Replaceable
   with measured critical-load kW in Design mode.
3. **Backup duration** — 5 / 15 / 30 / 60 / 120 minutes. Default 15.

Ready to play at **500 kVA, 50 %, 15 minutes**. A preset **Simulate grid failure** action runs the
outage without adding a fourth control. Assumed site power factor, critical-load power factor,
utilisation, efficiency and initial readiness appear in a short assumptions strip, editable under
**Explore deeper**.

**Illustrative quick-sizing basis** — teaching assumptions, not universal site characteristics: site
utilisation 100 % of contract demand, site PF 0.90, critical-load PF 0.90. **For a kW contract
demand, site power factor is not applied again.** A measured protected-load schedule *supersedes* the
contract-demand estimate rather than adding to it.

**Load requirements before headroom, losses and battery sizing:**

| Contract demand | Site demand @ PF 0.90 | Protected @ 50 % | Protected kVA @ PF 0.90 | AC load energy, 15 min |
| --- | --- | --- | --- | --- |
| 100 kVA | 90 kW | 45 kW | 50 kVA | 11.25 kWh |
| 250 kVA | 225 kW | 112.5 kW | 125 kVA | 28.125 kWh |
| 500 kVA | 450 kW | 225 kW | 250 kVA | 56.25 kWh |
| 1,000 kVA | 900 kW | 450 kW | 500 kVA | 112.5 kWh |
| 2,000 kVA | 1,800 kW | 900 kW | 1,000 kVA | 225 kWh |
| 5,000 kVA | 4,500 kW | 2,250 kW | 2,500 kVA | 562.5 kWh |

**The last column is delivered AC energy, not nominal battery capacity.** The table is recalculated
when controls change; it is not a static lookup standing in for the engine.

**Sizing logic, with consistent units:**

- kVA contract: `site kW = contract kVA × utilisation × site PF`. kW contract: `site kW = contract
  kW × utilisation`.
- `protected kW = site kW × protected fraction`, unless measured loads override it.
- `protected kVA = protected kW / critical-load PF`. Use measured phase and load data for final
  selection rather than assuming one aggregate PF suffices.
- Required continuous ratings satisfy **both** protected kW and protected kVA, after explicit growth
  headroom and equipment derating. **Headroom is kept separate from N+1 redundancy.** An
  illustrative 20 % power headroom is an editable assumption, never a universal requirement.
- `required load energy` = integral of protected AC power over the outage; for a constant load,
  `protected kW × hours`.
- Preliminary nominal battery estimate:

```
E_nom ≥ [ (P_load / eta_path + P_aux_DC) × duration_hours ]
        / [ available_SOC_fraction × retained_capacity_fraction ]
```

  `P_aux_DC` is referred to the **battery-terminal boundary**; AC auxiliaries are referred there
  first. `eta_path` covers the specified DC-to-protected-AC path. **Each loss is counted once.** The
  available SOC fraction is outage-start SOC minus minimum allowed SOC — **not automatically the
  full operating window.** This is a sizing estimate only; runtime and power are confirmed against
  the coupled battery/UPS model, discharge limits and equipment data.

Select the smallest compatible configured combination meeting power, energy, voltage, discharge-rate,
environmental and topology constraints, deriving module and rack counts **from the actual catalogue**.
Invented Solarworld or UPS ratings are not acceptable; with no catalogue, show clearly labelled
illustrative modular configurations with commercial selection pending.

Result cards for **Selected requirement**, **Next supported power size** and **Longer runtime
option**, only where a compatible catalogue or illustrative configuration supports them. Adding
battery energy extends runtime **only if** voltage, current and converter constraints still hold.
**Resize system** and **Test this system** are separate actions — comparing a fixed installation must
not silently resize it.

**The worked example, which §18 F05 tests:** 500 kVA × 0.90 × 50 % = **225 kW** protected; at PF 0.90
that is **250 kVA**; 15 minutes needs **56.25 kWh delivered to that load**. With 20 % headroom,
continuous output requirements become at least **270 kW and 300 kVA** before environmental derating.
Battery nameplate energy is then calculated from the visible assumptions and validated for the
required discharge rate. **56.25 kWh is not the battery to buy.**

**UPS operation and the role of ergOS.** Animate: grid healthy → grid fails → protected-load supply →
reserve falls → grid or generator returns → controlled recharge. Noncritical loads are shown
separately, with staged shedding available deeper. Generator handover is optional, uses a sourced or
explicitly illustrative delay, and **does not assume generator startup always succeeds**.

- **ergOS** reserves energy, monitors readiness, prevents economic dispatch from eating the required
  reserve, requests supported modes, prioritises loads where supported, schedules recharge within
  site limits. It computes the reserve needed for the selected duration and **reports insufficient
  readiness** when initial SOC or available capacity cannot meet it.
- **UPS / local conversion and transfer controls** provide the fast local response. **No-break
  continuity must never depend on a cloud EMS decision or a communications round trip.**
- **BMS** retains independent voltage, current and temperature protection. UPS operation cannot
  override it.

Distinguish an online UPS topology, a BESS backing an existing UPS, and an island-capable BESS with
finite transfer time. Default to an explicitly illustrative online UPS-compatible configuration;
expose architecture selection in Design mode. **Do not assume a generic PCS supports UPS duty**, or
that a BESS upstream of an existing UPS shares its DC bus. If the existing UPS has its own battery,
model it separately and count both stores correctly.

**Energy/autonomy adequacy and interruption compatibility are separate results.** A slow-timescale
energy model can estimate runtime; it cannot prove zero-break transfer, voltage-quality compliance or
protection coordination. Without sourced transfer data and the load's allowable interruption,
continuity is marked **not verified**. No "UPS-ready" or "no-break" claim without equipment evidence.

Default result panel: **protected load**, **required UPS kW/kVA**, **battery nameplate estimate**,
**achievable runtime** — four metrics. Continuity-evidence status sits beside the scenario label. Two
charts at most: SOC over time, and protected-load demand versus served power.

**Acceptance:** raising protected-load share raises the load requirement; extending duration raises
energy demand **without automatically raising steady-state inverter power**; changing load PF changes
required kVA at unchanged kW; short-duration sizing still respects discharge-current limits;
insufficient initial reserve produces unmet-runtime warnings; an economic policy never consumes
protected reserve silently; a compatible N+1 case meets its stated contingency; **and no configuration
earns a verified no-break claim from an energy calculation alone.**

### 15.4 Lead-acid versus lithium-ion, in Indian conditions

A **second step inside lesson 7**, not an eighth card. It reuses that lesson's contract demand,
protected load and duration, and runs both options side by side automatically — the user configures
no battery chemistry parameters.

Default comparison: **UPS-grade VRLA AGM lead-acid** versus **UPS-compatible LFP**. The exact
chemistry and model evidence are displayed. **Not all lithium-ion is LFP, and LFP performance is
never applied to NMC.** Flooded tubular, gel and other lead-acid technologies may be added as
separately sourced options, **never silently represented by VRLA data**. VRLA needs no routine
watering but still needs inspection and maintenance; a flooded option carries its own ventilation,
watering and maintenance assumptions.

**Compare equal service, not equal labels.** Both options must support the same protected kW/kVA,
outage profile, autonomy, redundancy, continuity requirement and end-of-life acceptance threshold.
Each battery is sized separately against **its own** discharge curves, current limits and usable
capacity. **Equal Ah or equal nominal kWh does not mean equal UPS service.** Any required change to
charger, inverter, protection, BMS, DC voltage or cabinet is disclosed.

Use manufacturer **constant-power discharge tables** at the relevant duration, end voltage and
temperature for VRLA, especially for 5–15 minute autonomy. **Runtime is never calculated from a
10-hour or 20-hour Ah rating without rate correction.** A fitted Peukert-style model is an explicitly
limited approximation. The LFP branch must also satisfy short-duration current and C-rate limits, and
may need more installed energy than a simple kWh calculation suggests.

**The existing lithium model is not relabelled to simulate lead-acid.** A distinct VRLA model, or an
interpolation of manufacturer discharge/recharge data with bounded applicability, is required.
Unsupported aging, temperature or partial-recharge behaviour uses declared sensitivity assumptions or
shows results as unavailable. **Precision is never fabricated.** Repeated outages carry forward actual
remaining SOC and recharge state.

**India scenario presets** — one **Operating conditions** selector. These are *illustrative Indian
site scenarios, not measured national averages or claims about any city or state*:

| Preset | Battery-room and operating assumptions | What it teaches |
| --- | --- | --- |
| Conditioned office / IT room | 25 °C setpoint; one 15-min outage per month; adequate grid time between events | float and calendar aging, upfront cost, replacement planning |
| Warm industrial electrical room | 35 °C target; one 15-min outage per day; optional 40 °C stress case | temperature exposure, cooling, warranty limits, repeated cycling |
| Repeated interruptions, limited recharge | 30 °C target; three 15-min outages at 10:00, 11:00, 12:00; recharge power constrained by site headroom | partial recharge, remaining reserve, readiness for the next outage |

**The outage schedule is independent of the requested backup duration** — selecting 60 minutes of
design autonomy must not turn every outage into a 60-minute event. A separate full-duration
verification run covers that. Annual repetition of an example day is an **explicit** assumption, never
a silent lifetime extrapolation.

Outdoor temperature, battery-room air and battery temperature are three different things. Room
warm-up during loss of cooling is modelled where supported; otherwise the simplified assumption is
exposed. **Battery temperature is never inferred from an Indian city name.** A condition outside the
equipment's operating envelope yields an **infeasible** result — and even inside it, rated service
life and warranty are not assumed unchanged.

Indian units throughout: ₹, ₹/kWh, kVA/kW contract demand, minutes of autonomy, ₹ lakh where
appropriate. Optional tariff sensitivity at **₹6, ₹9 and ₹12/kWh**, clearly labelled **teaching
values, not current DISCOM tariffs**. A sourced state/DISCOM/category tariff or a user's bill replaces
them, with an effective date. No "average Indian tariff" and no nationwide outage assumption.

Under **Explore deeper**: humidity, dust, ventilation, floor loading, space, local service reach,
replacement lead time, spares, generator availability, charger compatibility. Only effects supported
by the selected equipment data are numerically modelled; the rest are listed as **site checks**. DG
recharge is optional and uses a sourced or user-entered fuel cost with load-dependent generator
performance — not a universal ₹/kWh figure.

**Comparison outputs:** installed UPS kW/kVA and battery capacity for equal service; beginning- and
end-of-life autonomy; readiness before the next outage; recharge time under the same available site
power with actual charger limits; space and weight from configured equipment including cabinets and
clearances; temperature limits, service-life evidence and warranty conditions **separately**;
inspection and service requirements, replacement count, local support assumptions; upfront installed
cost, discounted lifecycle cost, and any calculated crossover year.

Four headline metrics: **installed cost**, **achievable runtime**, **recharge readiness**, **10-year
lifecycle cost**. Two charts at most: SOC through the selected outage day, and cumulative cost with
replacement events. Missing evidence shows ranges, an explicitly illustrative scenario, or
"quote/data required". **Missing cost data is never zero cost.**

The explanation stays conditional: *"Under these assumptions, option X has lower cost / more reserve
because …"*. Include a low-use conditioned-room case where **lead-acid can win**, and a
repeated-outage or space-constrained case where **lithium may win**. **Neither result is forced.**
Both chemistries need appropriate thermal management. No promise that lithium needs no cooling, never
burns, never needs replacement, or lasts a fixed number of years. A small UPS vendor's lifetime or
cost percentages are not generalised to a multi-MW installation.

### 15.5 India lifecycle-cost model

Default 10-year horizon, with optional 5- and 15-year views. Discounted TCO from: installed equipment
and integration, documented replacement events, labour and transport, inspection/AMC, charging and
standby losses, incremental cooling and ventilation energy, disposal and recycling charges, supported
residual or buyback value.

Common UPS conversion losses are included **consistently in both cases**; battery efficiency and
whole-system efficiency are distinguished. **The full protected-load energy is not charged to only
one chemistry, and cooling energy already in auxiliaries is not counted twice.**

Use dated local vendor quotations where available; otherwise present editable assumptions **without
claiming market prices**. GST treatment is explicit and consistent — no assumed rate, no assumed
input-tax-credit eligibility, and recoverable tax excluded only where that assumption is confirmed.
State discount rate, escalation, and nominal-versus-real basis. Demand charges and power-factor
penalties change **only** where the actual tariff and modelled metering justify it, not because the
chemistry changed.

**Replacement timing is evidence-based** — calendar age, temperature, cycling, required runtime —
**not a fixed "VRLA every 3 years, lithium every 10" rule.** Without evidence, compare declared
replacement-life sensitivity cases. Show **no crossover** within the horizon where that is the
answer. Speculative avoided-outage losses stay **outside** base TCO, available only as a separate
user-valued scenario. Capacity remaining at the horizon is explained, with consistent residual-value
treatment.

**Indian end-of-life handling** requires verification of the current Battery Waste Management Rules,
amendments, and applicable registered recycling or take-back arrangements **from official sources**.
Informal scrap sale is not compliant recycling, and buyback values for lead-acid and lithium are not
assumed identical. Producer versus end-user responsibilities are stated only after checking current
applicability; vendor take-back terms are recorded.

### 15.6 ergOS across both chemistries

The educational EMS applies the same backup objective to both branches, using **chemistry-specific**
reserve, available power, recharge and monitoring information. Lead-acid may expose battery-monitor
or UPS telemetry rather than a lithium-style BMS — **per-cell SOC signals that do not exist are not
invented**. The lesson explains why ergOS may hold a higher reserve or limit economic cycling to keep
UPS readiness.

Charger profiles, chemistry compatibility and local protections are **equipment functions, not a
software-only retrofit**. Replacing lead-acid with lithium requires manufacturer-approved
compatibility or a properly engineered equipment change.

**Acceptance:** equal-service constraints preserved; the 500 kVA example reproduced in both sizing
branches; undersized short-duration banks fail; incomplete recharge propagates across outages;
tariff, cooling, replacement arithmetic and timing verified; nominal and discounted costs reconciled;
sensitivity to room temperature shown without extrapolating unsupported life curves; "continuity not
verified" retained where appropriate. Every price, lifetime and performance claim carries source,
date, equipment scope and assumption status.

### 15.7 Public signed-out lessons — deferred

`GAP:` the supplied specification asked for public lessons with no login. Deferred, because §1.2
sequences learning after the quote. Revisit once the lesson engine is accepted: a curated subset
running on a fixed illustrative preset, with **no customer record and no proprietary price book**
reachable, would make a strong marketing surface. Not in the current stage plan.

---

## 16. Commercial integration

`GAP` — proposed.

Simulations link to an **immutable project revision**. An optional, concise **engineering appendix**
attaches to the offer: nominal and usable energy, AC power boundary, achievable duration under the
stated scenario, operating window, equipment availability, losses, model evidence badge, and the
model's limitations.

For UPS proposals the appendix also captures: contract demand **and its units**, assumed or measured
critical load, both power factors, UPS output kW/kVA, battery capacity, requested and achieved
autonomy, outage-start SOC, continuity requirement and evidence, redundancy, and recharge
assumptions. **Indicative contract-demand sizing stays visibly distinct from reviewed equipment
selection.**

Three rules that do not bend:

- **A simulation never autonomously releases a quotation.**
- **Modelled performance never becomes a warranty.**
- **A design change flags stale quotation assumptions** and triggers the applicable review workflow.

Role permissions for editing parameter sets, running advanced studies and approving engineering
evidence are defined **independently of pricing approval** — an engineer may approve model evidence
without approving a price, and an approver may release a price without vouching for a solver setting.

---

## 17. How this gets built

`GAP` — proposed. **One stage at a time, gated.** Each stage produces a usable, reviewable increment;
a collection of unfinished screens does not qualify. Previously accepted functionality keeps working
throughout. **No later stage may conceal an unresolved prerequisite failure.**

The live register — status, evidence, defects — is [`docs/STAGES.md`](./STAGES.md). This section
defines the contract; that file records what actually happened.

### 17.1 The rules

- **Define expected behaviour and numeric tolerances before implementing.** Derive expected values
  independently — from equations, equipment data or a reviewed fixture — **never by copying the
  function under test**.
- Implement only the active stage and its prerequisites. Unfinished future features stay absent or
  visibly unavailable behind a feature control.
- Run relevant unit and numerical tests, API and integration checks, browser workflow checks, and
  affected regression tests. Include **negative and failure cases**. *"It compiles"* and a screenshot
  are not acceptance evidence.
- Fix failures and rerun before submitting. **Never weaken a test to accept incorrect output.** A
  genuine requirement change is recorded with its rationale and consequences.
- Save an evidence packet tied to an **exact commit**. Any material change after testing invalidates
  the affected evidence until retested.
- Mark **READY FOR ACCEPTANCE** only when every mandatory check passes and no unresolved critical or
  major defect affects the stage. Cosmetic defects may be deferred only if they do not affect
  clarity, accessibility or the stated criteria.
- Record acceptance actor, date, tested revision and evidence. **Human sign-off is never invented.**
- **ACCEPTED** means the declared scope passed its gate. **LIVE** is marked only once the feature is
  actually available in the intended environment. Accepting an illustrative educational model is
  **not** equipment validation and **not** safety certification.

### 17.2 The stage sequence

Reordered from the supplied specification to match §1.2 — **the quoting tool is finished and
hardened before any simulation work begins**, and no stage touches the landing, the opening question
or the build sequence.

| Stage | Increment and dependency | Mandatory checks before acceptance |
| --- | --- | --- |
| **S0** — Baseline and acceptance contract | Audit the application and this document; record current behaviour; choose fixtures; define the harness. | Reproduce the build and all existing tests (103 unit + 35 rules). Exercise sizing, customer isolation and quotation permissions. Record baseline defects separately. Every proposed requirement has an owner stage. *A baseline defect touching a later stage's safety, data integrity or permissions blocks that stage.* |
| **S1** — Finish the quoting tool | Depends on S0. Close the remaining §10 gaps that block the commercial journey: sales queue for submitted enquiries, notifications, password reset. | Existing regression green. Browser: customer submits → appears in queue → sales picks up → approver releases → customer sees issued. Negative: no notification leaks another tenant's data. |
| **S2** — Model contracts and evidence | Depends on S1. Versioned plant/scenario/run records, units, signs, parameter provenance, input validation. | Round-trip persistence; invalid units, ranges and topologies rejected; kW/MW and minute/hour conversions; immutable run snapshots; hashes change with material inputs; evidence badges present; tenant authorization enforced on the new records **in the Firestore rules, not only the UI**. |
| **S3** — First charge/discharge lesson | Depends on S2. One LFP preset, Python engine, basic PCS/BMS limits, simple diagram, SOC/power plots, transparent manual EMS request. Reached from a project. | F01, F02. Charge/discharge signs; loss and boundary accounting; voltage/current/SOC cutoffs; reproducibility; timestep convergence; failed solver and invalid configuration display honestly. Browser: open from project → play → change power → replay → reset. |
| **S4** — PCS and BMS behaviour | Depends on S3. Explicit states, limits, event log, restriction explanations; supported thermal response for the hot preset. | F03. Requested versus achieved power; P/Q capability **plus** current and voltage limits; BMS veto and derating; hysteresis, delay, latching, reset; competing constraints and event ordering; weak-cell and temperature fixtures; **no hidden one-step overshoot** beyond declared tolerance. |
| **S5** — jouleWise ergOS EMS | Depends on S4. Visible supervisory policy, telemetry and decision log, reserve, setpoint cadence, policy comparison. | F04. Every explanation resolves to logged values and rules; reserve respected; infeasible dispatch reduced; BMS remains authoritative; stale telemetry follows the specified fallback; fixed-schedule comparison uses identical inputs and discloses ending SOC. **Verify no-break control does not depend on EMS or cloud response.** |
| **S6** — Lessons 1–6 | Depends on S5. Charge/discharge, peak reduction, solar use, backup reserve, price scheduling, battery limits. | One browser acceptance case per lesson including reset and baseline comparison; ≤3 controls, ≤4 metrics, ≤2 charts enforced; outputs agree across diagram and plots; prices illustrative; backup uses supported topology. **Observed beginner walkthrough, or mark usability validation pending.** |
| **S7** — Contract-demand UPS sizing | Depends on S6. Lesson 7, six presets, custom units, protected share, duration, readiness, equipment options. | F05. Every preset and the 500 kVA worked example; kVA versus kW handling; PF effect; load-fraction and duration boundaries; current and C-rate limits; catalogue compatibility; insufficient initial reserve; fixed-system test versus resize; **continuity remains unverified without evidence**. |
| **S8** — Lead-acid versus LFP | Depends on S7. Distinct VRLA model/data adapter, chemistry-compatible equipment, equal-service comparison. | F06. Equal protected load and autonomy, **not** equal Ah; VRLA constant-power discharge fixtures at relevant runtimes; LFP short-duration limits; recharge limits; SOC carried across successive outages; incompatibility and missing data detected. **No numeric result outside a validated or interpretable model range.** |
| **S9** — Indian conditions and lifecycle cost | Depends on S8. Three India presets, ₹ costs, tariff sensitivity, cooling, replacement, recycling. | F07. Outage schedules and partial recharge reproduced; room and battery temperature separated; independently checked 5/10/15-year cash-flow fixtures; discounting, taxes, losses, AMC, replacement timing, residual value; **no missing price treated as zero**; **no forced lithium winner**; evidence and dates on every market claim. |
| **S10** — Synchronised 3D | **DEFERRED** by decision (§20.2). 3D stays exactly as it is — the quote-generation experience — and the lessons ship in 2D. Revisit after S12. | *(not in the current plan)* |
| **S11** — Project and quotation integration | Depends on **S9** — dependency revised by the S10 deferral. Learning-to-design conversion, immutable results, engineering appendix with selected chemistry. | F08. End-to-end customer → sales → approver; role and tenant negative tests **through the rules as well as the UI**; stale designs invalidate quotation assumptions; approver reviews the exact revision; **indicative results never become warranties or self-issued offers**. |
| **S12** — Release readiness | Depends on S11. Production-like compute and jobs, retention, observability, recovery. | End-to-end smoke for all seven lessons and the comparison; job cancellation, timeouts, worker failure; cache isolation; quotas; export integrity; targeted regression of critical journeys; performance against predeclared budgets; **rollback and restore exercised**. Release only the exact tested revision. |

**S10 is deferred** by decision. S11 now depends on S9, recorded above. Full synchronised 3D stays
`GAP` and the original scope is **not** claimed complete. The existing 3D studio is untouched and
keeps doing what it already does well: carrying the quote-generation experience.

### 17.3 The instruction to start a stage

> Implement stage **[ID]** from this specification. First inspect the stage register in
> `docs/STAGES.md` and confirm its prerequisites are accepted. State the exact scope and required
> tests, implement the increment, run the mandatory numerical, integration, browser and regression
> checks, fix failures, and produce the revision-linked acceptance packet. Keep unrelated stages
> unchanged. Mark the result **READY FOR ACCEPTANCE** only if all mandatory checks pass; otherwise
> mark **BLOCKED** with evidence and the concrete remaining work. Do not claim human acceptance or
> begin the next stage unless existing authorization permits it. Preserve all previously accepted
> invariants **and the existing opening experience**.

---

## 18. Acceptance fixtures

`GAP` — **all NOT RUN.** Stable IDs; stage implementations supply the runnable locations. Tolerances
are predefined **per fixture and model** — tight for exact arithmetic, justified solver and
conservation tolerances for differential models, empirical error against equipment data recorded
separately. **No blanket tolerance.**

| ID | Fixture | Expected |
| --- | --- | --- |
| **F01** | Ideal energy — deliberately ideal constant-voltage 100 kWh model, 50 % initial SOC, no losses | 20 kW discharge for 30 min delivers **10 kWh**, ending at **40 % SOC**. Plus the sign-reversed charging case. *A sanity fixture, not a claim that electrochemical SOC always equals energy fraction.* |
| **F02** | Converter balance — 100 kW DC in, constant 95 % discharge efficiency, no auxiliaries | delivered AC = **95 kW**. Charging uses the declared **AC-to-DC** efficiency in the correct direction; the discharge formula is not reused blindly. |
| **F03** | Apparent-power headroom — otherwise unconstrained 100 kVA converter at 60 kvar | capability-circle active ceiling **80 kW**. Then add a stricter current/voltage limit and verify **the tighter bound wins**. |
| **F04** | Backup reserve | a discharge request at the reserve boundary cannot consume protected energy under the normal economic policy. A separately specified outage mode may use the emergency reserve to its allowed minimum; **that transition is tested and explained**. |
| **F05** | UPS sizing | 500 kVA × 0.90 × 50 % → **225 kW**; at PF 0.90 → **250 kVA**; 15 min → **56.25 kWh AC**. With 20 % headroom → **270 kW / 300 kVA** before derating. **Battery nominal energy must not be reported as 56.25 kWh.** |
| **F06** | Repeated outages | a bounded-charge fixture where recharge energy between outages is **less** than the previous withdrawal. The next event starts with lower reserve; it **must not silently reset to full SOC**. |
| **F07** | Costs | an independently reviewed small synthetic ledger — initial cost, one replacement, annual expenses, terminal residual. Check undiscounted and discounted totals, a zero discount rate, and a **no-crossover** case. **Live market data is never the only reproducible financial fixture.** |
| **F08** | Access and provenance | customer A cannot obtain customer B's run through direct identifiers, exports, or job/cache endpoints. A changed parameter set **cannot silently reuse the old result or its validated-data badge**. |

---

## 19. Requirement matrix

`GAP` — every row. Test IDs are **NOT RUN**.

| ID | Capability | § | Status | Engine | Stage | Fixtures |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | Sales queue, notifications, password reset | 10 | GAP | app | S1 | browser |
| R02 | Versioned plant/scenario/run records with provenance | 13.2 | GAP | app + Firestore | S2 | round-trip, rules |
| R03 | Sign conventions and unit adapters | 13.3 | GAP | Python | S2 | F02, F05 |
| R04 | Battery electrical/thermal response | 12.1–12.2 | GAP | PyBaMM Thevenin | S3 | F01, F02 |
| R05 | PCS averaged converter model | 12.3 | GAP | app model | S4 | F03 |
| R06 | BMS state machine and protections | 12.4 | GAP | app model | S4 | weak-cell, hysteresis |
| R07 | ergOS educational policy and decision log | 11.3 | GAP | app model | S5 | F04 |
| R08 | Policy comparison, fairly reported | 11.4 | GAP | app model | S5 | ending-SOC disclosure |
| R09 | Lessons 1–6 | 15 | GAP | above | S6 | one browser case each |
| R10 | Contract-demand UPS sizing | 15.3 | GAP | app maths | S7 | F05 |
| R11 | VRLA model and equal-service comparison | 15.4 | GAP | VRLA adapter | S8 | F06 |
| R12 | India presets and lifecycle cost | 15.4–15.5 | GAP | app maths | S9 | F07 |
| R13 | Synchronised 3D and one clock | 5.2 | GAP | three.js + run data | S10 | identity/timestamp |
| R14 | Engineering appendix on the offer | 16 | GAP | app | S11 | F08 |
| R15 | Release readiness | 17.2 | GAP | infra | S12 | smoke, rollback |
| R16 | Thermal, aging, grid coupling | 12.5 | GAP | PyBaMM + app | S4, S9 | conservation |
| R17 | Evidence badges | 14 | GAP | app | S2 | F08 |

---

## 20. Change log and open questions

### 20.1 What changed in this revision

- Added §11–20: the ergOS stack, simulation model, architecture, evidence rules, lesson catalogue,
  commercial integration, build protocol, fixtures, requirement matrix.
- Rewrote §1 into current state (1.1) and direction (1.2).
- Added §2.1 interface modes, and an `ASK:` on owner/admin self-approval.
- Added §3.0 the learner-after-the-quote, and §3.5 simulation-backed review.
- Added §4.0 proposed screen map; §5.2 real hierarchy and one clock; §7.5 proposed engines; §6
  engineering appendix.
- Renumbered §7.5 validation → §7.6.
- Created [`docs/STAGES.md`](./STAGES.md).

### 20.2 Deliberate departures from the supplied specification

| Asked for | Done instead | Why |
| --- | --- | --- |
| Learn as the default studio entry, no login | Learning reached from a completed design; opening experience untouched | User direction: quoting tool first, then the studio becomes the learning centre. The configuration a user just priced is a better teaching subject than a generic preset. |
| Public signed-out lessons | Deferred to §15.7 | Follows from the above. Recorded, not dropped. |
| Stages S0–S11 as supplied | S0–S12, with a new S1 finishing the quoting tool | The commercial journey must be complete before simulation work starts. |

### 20.3 Decisions taken

| Question | Decision | Consequence |
| --- | --- | --- |
| Quote approval | **One level inside the system.** Issue, download the PDF, manager signs it outside. `two-step` stays per-tenant. | Built. `approvalMode` defaults to `single`; the offer carries an **Internal approval** block; issuing never writes the approval fields. Full RBAC later. |
| Where the simulation runs | **Google Cloud VM**, on the existing Terraform environment. | Named but unspecified — the Terraform is not in this repo (§13.4). Needed before S2. |
| 3D | **2D first.** 3D stays as the quote-generation experience; lessons ship 2D; full synchronised 3D later. | S10 deferred; S11 now depends on S9. |
| Customer versus engineer in 3D | Follows from the above — no change to 3D rights for now. | Revisit with S10. |

### 20.4 Still open

1. **Where the Terraform environment lives** (§13.4). Blocks S2 planning, not S0 or S1.
2. **Record-level self-approval under `two-step`** (§2.1). An owner can still approve a quotation
   they prepared. Close it when in-system RBAC lands.

### 20.5 Equipment data still required

None of this can reach **Validated against equipment data** without:

- LFP cell parameter sets compatible with PyBaMM Thevenin, with applicability ranges.
- PCS efficiency maps, capability curves and derating characteristics for the catalogue converters.
- BMS thresholds, delays and hysteresis as actually configured.
- VRLA constant-power discharge tables at 5, 15, 30 and 60 minutes, at end voltage and temperature.
- UPS transfer times and topology evidence for any continuity claim.
- Dated Indian vendor quotations for battery, installation and service.
- ergOS product documentation — algorithms, interfaces, supported modes.

Until each arrives, the affected output carries **Illustrative parameters** and says so on its face.

---

*Developed and managed by jouleWise Technologies · www.joulewise.com*
