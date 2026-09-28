---
name: ui-ux-design
description: Documents bit2.0's design system — shadcn/Radix UI components, Tailwind v4 OKLCH tokens, sidebar-based layout pattern, and UI conventions used across the Admin/Manager/Employee portals. Use before building or styling any new page, component, dialog, or form.
---

# bit2.0 — UI/UX Design System

## Foundation

- **Tailwind v4** (CSS-first config, no `tailwind.config.js` — theme lives in
  [src/app/globals.css](src/app/globals.css) via `@theme inline`).
- **shadcn/ui** ("new-york" style, per [components.json](components.json)) on top of
  **Radix UI** primitives (`@radix-ui/react-*`, also re-exported via the `radix-ui` package).
- Icons: `lucide-react`. Toasts: `sonner`. Forms: `react-hook-form` + `@hookform/resolvers`
  + `zod` schemas. Charts: `recharts`. Dates: `date-fns` + `react-day-picker`.
- Utility: `cn()` in [src/lib/utils.ts](src/lib/utils.ts) (clsx + tailwind-merge) — always
  use this to merge conditional class names, never string-concatenate classes.
- `class-variance-authority` (cva) is used for variant-based components (see
  [src/components/ui/button.tsx](src/components/ui/button.tsx), `badge.tsx`) — follow this
  pattern when a component needs style variants (size, intent, etc.).

## Component library

All primitives live in [src/components/ui/](src/components/ui/) (button, input, select,
dialog, sheet, table, form, sidebar, tabs, tooltip, popover, dropdown-menu, calendar, etc.)
— **always check here first** before writing a new UI primitive; these are the shadcn
building blocks every screen is composed from.

Domain/feature components are organized by portal under `src/components/`:
`admin/`, `manager/`, `employee/`, `shared/`, `system/`, plus feature-specific folders
(`late-checkin/`, `timeline-modification/`). Shared cross-portal pieces (`AppSidebar`,
`Header`, `ManagerSidebar`, `ManagerHeader`) live at `src/components/` top level. When a
component is genuinely used by 2+ portals, put it in `shared/`; otherwise scope it to its
portal folder — don't default everything into `shared/`.

## Design tokens (light/dark via OKLCH)

Colors are defined as CSS variables in `:root` and `.dark` in `globals.css`, using the OKLCH
color space, and mapped into Tailwind via `@theme inline` (`--color-primary`,
`--color-destructive`, `--color-sidebar`, `--color-chart-1..5`, etc.). Radius scale
(`--radius-sm` … `--radius-4xl`) derives from a single `--radius: 0.625rem` base.
**Never hardcode hex/rgb colors** in components — use the semantic token classes
(`bg-background`, `text-muted-foreground`, `border-border`, `bg-destructive`, etc.) so
dark mode (`next-themes`, class-based `.dark`) keeps working for free.

## Layout pattern (all three portals)

Every gated layout wraps content in shadcn's `Sidebar` primitives:

```
<SidebarProvider>
  <AppSidebar /* or ManagerSidebar */ role={...} isManager={...} />
  <SidebarInset>
    <Header /* or ManagerHeader */ />
    <main className="flex-1 p-6 overflow-auto">{children}</main>
  </SidebarInset>
</SidebarProvider>
```

- Admin: `p-6`. Employee: responsive `p-2 sm:p-4 md:p-6` (mobile-first — employee portal is
  used more on phones). Match this convention for new pages in each portal.
- Sidebar nav items are role-aware — `AppSidebar` takes `role`/`isManager` props and renders
  a different menu accordingly; don't build a second sidebar component for a role variant,
  extend the existing one.

## Forms & dialogs

- Multi-field forms use `react-hook-form` + a `zod` schema + shadcn's `Form`/`FormField`
  wrapper (see `src/components/ui/form.tsx` and e.g. `ProfileEditFormTabbed.tsx` for a large
  tabbed-form example).
- Create/edit actions that don't need a full page use shadcn `Dialog` (see
  `ManageEmployeeDialog.tsx`, `EditEmployeeDialog.tsx`) — prefer a dialog over a new route
  for simple CRUD on an existing list page.
- Destructive actions (delete, decline, reject) should use `AlertDialog`, not `Dialog`.
- Status/state badges (loan status, leave status, employee status) use the `Badge`
  component with `variant` mapped from the enum value — follow the existing badge-variant
  mapping pattern rather than inline color classes.

## Conventions to preserve

- Tables (`src/components/ui/table.tsx`) for list views, with sorting where the data can
  grow large (see the recently added employee-timeline column sorting).
- Loading states use `Skeleton`; empty/pending states get an explicit message, not a blank
  screen.
- Keep new screens consistent with the nearest existing screen in the same portal before
  introducing a new layout idiom — this app favors consistency across ~40 pages over
  per-page creativity.
