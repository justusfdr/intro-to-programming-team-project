// Every Analytics widget (spec 49) by its kind, so the grid, the details and a later "Edit widgets"
// dialog draw the same component for a kind.
import type { ComponentType } from "react";
import type { WidgetKind } from "@/lib/analytics/report-types";
import { BlockedHoursWidget, BlockedVisitsWidget, BlockedWeeksWidget, CleanSessionsWidget, TopSitesWidget } from "./blocked";
import { BestHoursWidget, BestOfWeekWidget, FocusScoreWidget, FocusTimeWidget, SessionsWidget, WeeksWidget } from "./focus";
import { DeadlinesWidget, GoalStreaksWidget, GoalsReachedWidget, PlanWidget, SlippedWidget } from "./goals";
import { WeekInShortWidget } from "./overview";
import type { WidgetProps } from "./parts";
import { HeatmapWidget, StreakWidget, WeekdaysWidget } from "./streaks";
import { BusiestDayWidget, PlanKeptWidget, TimeByDayWidget, TimeOnGoalsWidget, TopAreasWidget } from "./time";

export type { WidgetProps } from "./parts";

export const WIDGET_COMPONENTS: Record<WidgetKind, ComponentType<WidgetProps>> = {
  focus_time: FocusTimeWidget,
  focus_score: FocusScoreWidget,
  sessions: SessionsWidget,
  weeks: WeeksWidget,
  best_hours: BestHoursWidget,
  best_of_week: BestOfWeekWidget,
  goals_reached: GoalsReachedWidget,
  goal_streaks: GoalStreaksWidget,
  deadlines: DeadlinesWidget,
  plan: PlanWidget,
  slipped: SlippedWidget,
  time_by_day: TimeByDayWidget,
  top_areas: TopAreasWidget,
  plan_kept: PlanKeptWidget,
  busiest_day: BusiestDayWidget,
  time_on_goals: TimeOnGoalsWidget,
  streak: StreakWidget,
  heatmap: HeatmapWidget,
  weekdays: WeekdaysWidget,
  blocked_visits: BlockedVisitsWidget,
  clean_sessions: CleanSessionsWidget,
  blocked_weeks: BlockedWeeksWidget,
  blocked_hours: BlockedHoursWidget,
  top_sites: TopSitesWidget,
  week_in_short: WeekInShortWidget,
};
