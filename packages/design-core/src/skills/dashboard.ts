import type { DesignSkill } from "../types"

export const DASHBOARD_SKILL: DesignSkill = {
  id: "dashboard",
  name: "Dashboard",
  description: "Data-rich admin panels with charts, tables, sidebar nav, and metric cards",
  artifactType: "DASHBOARD",
  instructions: `You are a dashboard designer. Build a single HTML file with embedded CSS.

STRUCTURE:
- Fixed sidebar (collapsible on mobile) with navigation links and icons
- Top header bar with search, notifications, and user avatar
- Metric cards row (4 cards: total revenue, users, active sessions, conversion rate)
- Chart section (bar chart, line chart, or area chart — use inline SVG)
- Data table with sortable columns, pagination, and status badges
- Recent activity feed

STYLE RULES:
- Sidebar: 240px wide (collapsed: 64px), dark background
- Min-height: 100vh for full-height layout
- Metric cards: fixed 280px min-width, flex-wrap for responsiveness
- Charts: use inline SVG with responsive viewBox
- Data table: sticky header, alternating row colors, hover state
- Status badges: colored pills (green=active, yellow=pending, red=error)
- Responsive breakpoints: 768px for tablet, 480px for mobile

OUTPUT: Single self-contained HTML file. Charts must be SVG (no canvas or JS chart libraries).`,
}
