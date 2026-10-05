# Airmech One — Design System

**Product:** Airmech One  
**Built by:** Qeilvra

This file defines the complete visual language for Airmech One.

The application must feel like professional industrial operations software.

It must NOT look like:

- a generic SaaS template
- ChatGPT
- an AI-generated landing page
- a crypto dashboard
- a gaming dashboard
- a marketing website

---

# 1. Design Direction

The interface should feel:

```text
Industrial
Professional
Operational
Precise
Premium
Dense but readable
Fast
Reliable
Calm
Modern
```

The visual goal is:

> High-information operational software without visual clutter.

Airmech employees will spend hours inside the application.

The interface should therefore prioritize:

```text
Clarity
Speed
Hierarchy
Readability
Fast scanning
Predictable navigation
Low visual fatigue
```

---

# 2. Performance Rule

Visual design must never reduce application speed.

Do NOT compromise software performance for:

- animations
- gradients
- decorative backgrounds
- large images
- remote fonts
- huge icon libraries
- excessive shadows
- unnecessary charts
- complex visual effects

Prefer:

```text
CSS
small SVG icons
system fonts
simple transitions
lightweight components
lazy-loaded charts
```

---

# 3. Brand Structure

The product should display:

```text
Airmech One
Operations Management System

Built by Qeilvra
```

Qeilvra branding should be visible but secondary to Airmech.

Example sidebar:

```text
AIRMECH ONE
Operations

────────────

Dashboard
Customers
Commercial
Projects
Service
Assets
AMC
Reports

────────────

Built by Qeilvra
```

---

# 4. Primary Color Palette

The application should use a dark industrial navy as its main identity.

## Primary Navy

```css
--navy-950: #071821;
--navy-900: #0B2230;
--navy-850: #102C3A;
--navy-800: #153746;
```

Use for:

- sidebar
- navigation
- top bars
- important headings
- selected dark surfaces
- mobile navigation
- strong contrast areas

Primary application color:

```css
--primary: #0B2230;
```

---

# 5. Secondary Color

Use teal as the operational accent.

```css
--teal-800: #0B6573;
--teal-700: #0F7484;
--teal-600: #16889A;
--teal-200: #CBE7EB;
--teal-100: #E6F2F4;
```

Use teal for:

- primary actions
- active navigation
- links
- selected controls
- charts
- focus states
- highlighted operational information

Primary action:

```css
background: #0F7484;
color: #FFFFFF;
```

Hover:

```css
background: #0B6573;
```

---

# 6. Application Background

Do NOT use pure white as the entire application background.

Use a very light steel-gray tone.

```css
--app-background: #F1F4F5;
```

Alternative elevated background:

```css
--background-secondary: #E9EEF0;
```

This gives the application more depth than:

```css
#FFFFFF
```

without making it visually heavy.

---

# 7. Surface Colors

Cards, tables and workspace panels:

```css
--surface-primary: #FAFBFB;
--surface-secondary: #F5F7F8;
--surface-elevated: #FFFFFF;
```

The application should mostly use:

```text
Background
↓
Surface
↓
Border
```

instead of heavy shadows.

---

# 8. Text Colors

```css
--text-primary: #132630;
--text-secondary: #52666F;
--text-muted: #788990;
--text-disabled: #A6B1B6;
--text-on-dark: #F5F8F9;
```

Primary text must have strong contrast.

Secondary information should remain clearly readable.

---

# 9. Border Colors

```css
--border-default: #D4DEE2;
--border-light: #E4EAED;
--border-strong: #B7C6CC;
```

Use borders extensively instead of shadows.

Example:

```css
border: 1px solid #D4DEE2;
```

---

# 10. Semantic Colors

Semantic colors communicate operational state.

## Success

```css
--success: #24725B;
--success-bg: #E7F3EE;
--success-border: #B9DDCE;
```

Use for:

```text
Completed
Resolved
Active
Approved
Won
```

---

## Warning

```css
--warning: #9A6414;
--warning-bg: #FFF3DE;
--warning-border: #E9C98D;
```

Use for:

```text
Pending
Due Soon
Waiting
Needs Attention
```

---

## Danger

```css
--danger: #A94444;
--danger-bg: #FAECEC;
--danger-border: #E6BBBB;
```

Use for:

```text
Overdue
High Priority
Failed
Expired
Critical
```

---

## Information

```css
--info: #31718E;
--info-bg: #E9F3F7;
--info-border: #BCD7E3;
```

---

# 11. Status Must Not Depend Only on Color

Bad:

```text
●
```

Better:

```text
● High Priority
```

Best:

```text
HIGH
```

with color supporting the label.

Examples:

```text
OPEN
IN PROGRESS
WAITING PART
RESOLVED
CLOSED
OVERDUE
```

---

# 12. Typography

Do not use decorative or trendy fonts.

Do not load unnecessary remote fonts.

Use a fast system font stack.

```css
font-family:
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  Arial,
  sans-serif;
```

This improves:

```text
Performance
Readability
Consistency
Loading speed
```

---

# 13. Typography Scale

## Main Page Title

```css
font-size: 28px;
font-weight: 700;
line-height: 1.2;
```

Example:

```text
Service Operations
```

---

## Section Heading

```css
font-size: 20px;
font-weight: 650;
```

---

## Panel Heading

```css
font-size: 16px;
font-weight: 650;
```

---

## Body

```css
font-size: 14px;
font-weight: 400;
line-height: 1.5;
```

---

## Table Content

```css
font-size: 13px;
```

Important values:

```css
font-weight: 600;
```

---

## Supporting / Metadata

```css
font-size: 12px;
color: #788990;
```

---

# 14. Numbers

For dashboards and operational numbers use tabular numbers if available.

Examples:

```text
18 Open Enquiries
14 Complaints
22 Engineer Jobs
12 AMC Due
```

Avoid giant marketing-style KPI numbers.

The goal is operational scanning, not advertising.

---

# 15. Spacing System

Use a 4px grid.

```text
4px
8px
12px
16px
20px
24px
32px
40px
```

Common spacing:

```text
Page padding desktop     24px
Page padding tablet      20px
Page padding mobile      16px

Card padding             16px
Large panel padding      20px

Component gap            12px
Panel gap                16px

Section gap              24px
```

---

# 16. Border Radius

Do NOT create excessive rounded interfaces.

Use restrained radii.

```css
--radius-sm: 4px;
--radius-md: 6px;
--radius-lg: 8px;
```

Use:

```text
Input       6px
Button      6px
Card        6px
Table       6px
Drawer      8px
Modal       8px
```

Avoid:

```text
16px
20px
24px
30px
999px
```

for ordinary components.

No pill-shaped primary buttons.

---

# 17. Shadows

Avoid large soft shadows.

Most separation should come from:

```text
background
border
spacing
```

Allowed subtle elevated shadow:

```css
box-shadow:
  0 4px 16px rgba(11, 34, 48, 0.08);
```

Use mainly for:

```text
Dropdowns
Modals
Drawers
Floating menus
```

Do not add shadow to every card.

---

# 18. Desktop Application Layout

Desktop should prioritize operational visibility.

```text
┌────────────────────────────────────────────────────────────┐
│ Top Bar                                      Search   User │
├──────────────┬─────────────────────────────────────────────┤
│              │ Page Title                    Actions       │
│ AIRMECH ONE  │─────────────────────────────────────────────│
│              │ Filters                                     │
│ Dashboard    │                                             │
│ Customers    │ Main Operational Workspace                  │
│ Commercial   │                                             │
│ Projects     │ Tables / Lists / Details / Charts           │
│ Service      │                                             │
│ Assets       │                                             │
│ AMC          │                                             │
│ Reports      │                                             │
│              │                                             │
│ Qeilvra      │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

---

# 19. Desktop Sidebar

Preferred width:

```css
width: 230px;
```

Collapsed:

```css
width: 68px;
```

Background:

```css
#0B2230
```

Text:

```css
#DDE7EA
```

Active item:

```css
background: #153746;
border-left: 3px solid #16889A;
```

Do not use glowing active items.

---

# 20. Sidebar Navigation

Recommended grouping:

```text
Overview
  Dashboard

Customers
  Customers

Commercial
  Enquiries
  Quotations

Operations
  Projects
  Complaints
  Work Orders
  Engineers

Assets
  Equipment
  Warranty
  AMC

Management
  Reports
  Documents

System
  Administration
```

Use separators or spacing between groups.

---

# 21. Top Bar

Top bar contains:

```text
Page context
Global Search
Quick Create
Notifications
Current User
```

Height:

```css
56px;
```

Avoid large header bars.

---

# 22. Page Header

Example:

```text
Service Operations

Manage complaints, work orders and engineer assignments.

                         + New Complaint
```

Page headers should remain compact.

No giant page hero sections.

---

# 23. Dashboard Layout

Dashboard should be modular.

Example:

```text
┌──────────┬──────────┬──────────┬──────────┐
│ Open     │ Active   │ Open     │ AMC Due  │
│ Enquiry  │ Projects │ Compl.   │          │
└──────────┴──────────┴──────────┴──────────┘

┌─────────────────────────┬──────────────────┐
│ Work Needing Attention  │ Engineer Status  │
│                         │                  │
└─────────────────────────┴──────────────────┘

┌─────────────────────────┬──────────────────┐
│ Commercial Pipeline     │ Upcoming PM      │
└─────────────────────────┴──────────────────┘
```

Do not make every dashboard item a giant standalone card.

---

# 24. KPI Cards

KPI cards should be compact.

Example:

```text
OPEN COMPLAINTS

14

3 High Priority
```

Use:

```css
min-height: 92px;
```

Avoid oversized number displays.

---

# 25. Data Tables

Tables are one of the most important components.

Desktop tables should be information-dense.

Example:

```text
┌──────────┬──────────────┬────────┬──────────┬──────────┐
│ ID       │ Customer     │ Status │ Engineer │ Updated  │
├──────────┼──────────────┼────────┼──────────┼──────────┤
│ CMP-214  │ ABC Hotel    │ Open   │ Ahmed    │ 10m ago  │
│ CMP-213  │ XYZ Factory  │ Wait   │ Salman   │ 32m ago  │
└──────────┴──────────────┴────────┴──────────┴──────────┘
```

Table requirements:

```text
Sticky header
Sorting
Filters
Search
Pagination
Row hover
Clear status
Compact spacing
```

Never load thousands of rows at once.

---

# 26. Table Row Height

Recommended:

```css
min-height: 44px;
```

Avoid oversized rows unless content genuinely requires it.

---

# 27. Mobile Tables

Do NOT squeeze wide desktop tables onto mobile.

Desktop:

```text
Complaint ID | Customer | Asset | Engineer | Status | SLA
```

Mobile becomes:

```text
CMP-2026-214
ABC Hotel

Water-Cooled Chiller
Ahmed Khan

HIGH • IN PROGRESS

SLA: 1h 22m
```

Tap opens full details.

---

# 28. Buttons

## Primary

```css
background: #0F7484;
color: #FFFFFF;
height: 40px;
border-radius: 6px;
```

Use for one main page action.

Examples:

```text
Create Complaint
Assign Engineer
Save Changes
Generate Report
```

---

## Secondary

```css
background: transparent;
border: 1px solid #B7C6CC;
color: #14242C;
```

---

## Destructive

```css
background: #A94444;
color: #FFFFFF;
```

Only for actual destructive actions.

---

# 29. Button Rules

Good:

```text
Assign Engineer
Close Complaint
Create Customer
Generate Report
Save Changes
```

Avoid vague:

```text
Submit
Proceed
Continue
Click Here
Go
```

---

# 30. Inputs

Input height:

```css
40px;
```

Example:

```text
Customer Name
┌──────────────────────────────┐
│ ABC Engineering LLC          │
└──────────────────────────────┘
```

Always use visible labels.

Never use placeholders as the only label.

---

# 31. Forms

Desktop forms should use logical groups.

Example:

```text
CUSTOMER

Company Name          Customer Code
[____________]        [____________]

Primary Contact       Phone
[____________]        [____________]

Email                 Status
[____________]        [____________]
```

Do not create one extremely long single-column desktop form when two-column grouping is clearer.

---

# 32. Form Errors

Show errors beside the field.

Example:

```text
Engineer

[ Ahmed Khan ▼ ]

Engineer is already scheduled at this time.
```

Preserve all other entered values.

---

# 33. Search

Global search must feel immediate.

Example:

```text
Search customers, assets, complaints, serial numbers...
```

Results grouped:

```text
CUSTOMERS
ABC Hotel

ASSETS
CH-03 — Trane Chiller

COMPLAINTS
CMP-2026-214
```

Exact IDs should rank first.

---

# 34. Filters

Desktop:

```text
Status ▼  Priority ▼  Engineer ▼  Date ▼     Search
```

Mobile:

```text
[ Search ]

[ Filters 3 ]
```

Opening:

```text
Full-screen filter sheet
```

Do not place 8 dropdowns horizontally on mobile.

---

# 35. Tabs

Tabs should organize related details.

Example:

```text
Overview
Activity
Assets
Complaints
AMC
Documents
```

Active:

```css
color: #0F7484;
border-bottom: 2px solid #0F7484;
```

Avoid pill tabs unless necessary.

---

# 36. Customer 360 Layout

Desktop:

```text
┌───────────────────────────────────────────┐
│ ABC Hotel                                 │
│ Muscat • Active Customer                  │
└───────────────────────────────────────────┘

Overview | Sites | Assets | Complaints | AMC | Documents

┌─────────────────────┬─────────────────────┐
│ Customer Details    │ Recent Activity     │
├─────────────────────┼─────────────────────┤
│ Sites               │ Open Complaints     │
├─────────────────────┼─────────────────────┤
│ Equipment           │ Upcoming PM         │
└─────────────────────┴─────────────────────┘
```

---

# 37. Complaint Screen

Desktop can use a split workflow:

```text
┌──────────────────┬────────────────────────────────────┐
│ Complaint List   │ CMP-2026-214                       │
│                  │                                    │
│ CMP-214          │ Overview                           │
│ CMP-213          │ Asset                              │
│ CMP-212          │ Engineer                           │
│                  │ Timeline                           │
│                  │ Work Orders                        │
└──────────────────┴────────────────────────────────────┘
```

---

# 38. Work Order Screen

Main information order:

```text
Status
Priority
Customer
Site
Asset
Complaint
Engineer
Schedule
Instructions
Diagnosis
Work Performed
Parts
Photos
Recommendations
Signature
Timeline
```

---

# 39. Timeline Component

Example:

```text
10:02
Complaint created
Sarah M.

10:11
Assigned to Ahmed Khan
Service Manager

11:18
Engineer arrived on site

12:04
Waiting for replacement part
```

Timeline should be visually simple.

No decorative animation.

---

# 40. Status Badges

Example shape:

```text
OPEN

IN PROGRESS

WAITING PART

RESOLVED
```

Use:

```css
padding: 3px 7px;
border-radius: 4px;
font-size: 11px;
font-weight: 650;
```

Not:

```css
border-radius: 999px;
```

---

# 41. Notifications

Example:

```text
Complaint CMP-214 is approaching SLA limit.

View complaint
```

Notifications must be actionable.

Avoid meaningless notifications.

---

# 42. Empty States

Bad:

```text
No data.
```

Better:

```text
No open complaints.

New complaints will appear here when customers report an issue.
```

Optional action:

```text
Create Complaint
```

---

# 43. Loading States

Prefer skeletons for page structure.

Do not block the entire page if only one widget is loading.

Example:

```text
Dashboard loaded
↓
AMC widget loading independently
```

---

# 44. Charts

Use charts only when they answer an operational question.

Good:

```text
Complaint Resolution Trend
Engineer Workload
Quotation Conversion
AMC Due by Month
```

Avoid:

```text
Decorative donut chart
Random colorful graphs
Charts showing data already obvious from a number
```

---

# 45. Chart Colors

Primary series:

```css
#0F7484
```

Secondary:

```css
#526F7B
```

Success:

```css
#24725B
```

Warning:

```css
#9A6414
```

Danger:

```css
#A94444
```

Do not create rainbow dashboards.

---

# 46. Icons

Use one consistent icon family.

Icons should be:

```text
Simple
Outlined
Functional
Small
Consistent
```

Examples:

```text
Search
Bell
User
Calendar
Document
Equipment
Engineer
Settings
```

Do not use emoji as interface icons.

Do not import hundreds of icons if only 20 are needed.

---

# 47. Mobile Design Philosophy

Mobile must contain the same permitted capabilities as desktop.

However:

> Mobile must be redesigned around tasks instead of being a narrow desktop page.

---

# 48. Mobile Navigation

Recommended bottom navigation:

```text
Home
Work
Customers
Search
More
```

Engineer variation:

```text
Home
Jobs
Search
Customers
More
```

Management variation:

```text
Home
Operations
Customers
Reports
More
```

---

# 49. Mobile Home

Example:

```text
AIRMECH ONE                 Bell

Good morning, Ahmed

TODAY
────────────────────

3 Jobs Today
1 High Priority
2 PM Visits

NEXT JOB
────────────────────

ABC Hotel
Water-Cooled Chiller

10:30 AM
Muscat

[ View Job ]

────────────────────

Open Complaints       14
AMC Due               12
```

---

# 50. Mobile Detail Pages

Mobile should use drill-down navigation.

Example:

```text
Complaints
    ↓
CMP-2026-214
    ↓
Overview
Timeline
Asset
Work Orders
Documents
```

Do not place everything on one giant screen.

---

# 51. Sticky Mobile Actions

For important job screens:

```text
┌───────────────────────────┐
│ Work order content        │
│                           │
│                           │
├───────────────────────────┤
│ Start Job    More         │
└───────────────────────────┘
```

Actions remain reachable without scrolling back to top.

---

# 52. Mobile Sheets

Use bottom sheets for:

```text
Filters
Quick actions
Engineer assignment
Status change
Date/time selection
```

Do not use tiny desktop dropdowns on mobile.

---

# 53. Responsive Breakpoints

Suggested:

```css
Mobile:
0 - 639px

Tablet:
640px - 1023px

Desktop:
1024px+

Wide:
1440px+
```

Do not design only at fixed breakpoint widths.

Layouts must remain fluid.

---

# 54. Desktop vs Mobile

Desktop:

```text
Sidebar
Tables
Multi-column panels
Split views
Hover support
```

Mobile:

```text
Bottom navigation
Cards
Tabs
Drill-down pages
Sheets
Sticky actions
Touch-first controls
```

Same functionality.

Different interaction model.

---

# 55. Accessibility

Aim for WCAG AA.

Important:

```text
Visible keyboard focus
Readable contrast
Keyboard navigation
Proper field labels
Status not color-only
Accessible tables
Accessible dialogs
Touch targets
```

Touch targets should generally be at least:

```css
40px;
```

for primary mobile controls.

---

# 56. Focus State

Use:

```css
outline: 2px solid #16889A;
outline-offset: 2px;
```

Do not remove focus outlines without replacement.

---

# 57. Animation

Animation should be minimal.

Allowed:

```text
Modal opening
Drawer transition
Loading progress
Status transition
```

Duration:

```css
120ms - 200ms;
```

Avoid:

```text
animated counters
scroll effects
bouncing cards
floating objects
cursor effects
background animations
```

---

# 58. Visual Hierarchy

A screen should clearly show:

```text
1. Where am I?
2. What needs attention?
3. What can I do?
4. What is the current status?
5. Where can I find more detail?
```

If the user cannot answer these quickly, redesign the page.

---

# 59. Density

Airmech One is work software.

Do not make it excessively spacious.

Use comfortable information density.

Bad:

```text
One small card

[huge empty space]

Another card
```

Better:

```text
Relevant information grouped together
with clear spacing and hierarchy.
```

---

# 60. Things To Explicitly Avoid

Do NOT use:

```text
Purple gradients
Rainbow gradients
Glassmorphism
Liquid glass
Neon effects
Radial orbs
Dot-grid backgrounds
Giant rounded containers
Pill primary buttons
Large soft shadows
Fake customer metrics
Fake testimonials
Emoji navigation icons
Sparkle icons
Animated arrows
Cursor animations
Floating decorative shapes
Huge hero sections
Three generic feature cards
Marketing landing-page layouts
Unnecessary bento grids
Terminal-window decorations
Huge amounts of white space
Every section inside a card
Over-animation
Rainbow charts
```

---

# 61. Overall Visual Example

Desktop:

```text
┌─────────────────────────────────────────────────────────────┐
│ Service Operations               Search       Bell   User  │
├─────────────┬───────────────────────────────────────────────┤
│ AIRMECH ONE │                                               │
│             │ Open Complaints                               │
│ Dashboard   │                                               │
│ Customers   │ 14 Open      3 High       5 Waiting Part     │
│ Commercial  │                                               │
│ Projects    ├───────────────────────────┬───────────────────┤
│ Service     │ Work Needing Attention    │ Engineers         │
│ Assets      │                           │                   │
│ AMC         ├───────────────────────────┼───────────────────┤
│ Reports     │ Complaints                │ Upcoming PM       │
│             │                           │                   │
│ Qeilvra     │                           │                   │
└─────────────┴───────────────────────────┴───────────────────┘
```

Mobile:

```text
┌──────────────────────┐
│ AIRMECH ONE      Bell│
├──────────────────────┤
│ Service Operations   │
│                      │
│ Open Complaints  14  │
│ High Priority      3 │
├──────────────────────┤
│ Needs Attention      │
│                      │
│ CMP-214              │
│ ABC Hotel            │
│ Waiting Part         │
│                      │
│ CMP-209              │
│ Industrial Site      │
│ SLA 32 min           │
├──────────────────────┤
│ Home Work Cust Search│
└──────────────────────┘
```

---

# 62. Final Design Principle

Every UI decision should prioritize:

```text
Operational clarity
>
Decoration

Speed
>
Visual effects

Information hierarchy
>
Empty space

Readable data
>
Fancy cards

Task completion
>
Animation

Consistency
>
Novelty
```

Airmech One should feel like a purpose-built operational platform designed by Qeilvra, not a generic template.
```