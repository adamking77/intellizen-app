declare module "frappe-gantt" {
  export interface GanttTask {
    id: string;
    name: string;
    start: string;
    end: string;
    progress?: number;
    dependencies?: string;
    [key: string]: unknown;
  }

  interface GanttOptions {
    view_mode?: "Quarter Day" | "Half Day" | "Day" | "Week" | "Month" | "Year";
    date_format?: string;
    view_mode_select?: boolean;
    today_button?: boolean;
    scroll_to?: "start" | "today" | "end";
    bar_height?: number;
    bar_corner_radius?: number;
    padding?: number;
    readonly?: boolean;
    readonly_progress?: boolean;
    readonly_dates?: boolean;
    on_click?: (task: GanttTask) => void;
    on_date_change?: (task: GanttTask, start: Date, end: Date) => void;
    on_progress_change?: (task: GanttTask, progress: number) => void;
    on_view_change?: (mode: string) => void;
    popup?: ((ctx: unknown) => void) | false;
    popup_on?: "click" | "hover";
    [key: string]: unknown;
  }

  export default class Gantt {
    constructor(
      wrapper: HTMLElement | string,
      tasks: GanttTask[],
      options?: GanttOptions,
    );
    refresh(tasks: GanttTask[]): void;
    change_view_mode(mode: string): void;
    scroll_today(): void;
  }
}
