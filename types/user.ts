export interface Users {
  user: User
  metrics: Metrics
  tasks: Task[]
}

export interface User {
  id: string
  name: string
  github_login: string
  avatar_url: string
}

export interface Metrics {
  total_tasks: number
  completed_tasks: number
  completion_rate: number
  avg_cycle_time_days: any
  median_active_days: number | null
  active_tasks: number
  unmapped_tasks: number
  reopened_tasks: number
  overdue_tasks: number
  total_story_points: number
  tasks_without_sp: number
  bucket_breakdown: any[]
}

export interface Task {
  id: string
  title: string
  status: string
  bucket: any
  url: string
  repository: string
  created_at: string
  closed_at?: string
  start_date?: string
  end_date?: string
  type: string
  is_done: boolean
  is_overdue: boolean
  done_at?: string
  reopen_count: number
  active_ms: number | null
  story_points?: number
  labels: Label[]
  histories: History[]
}

export interface Label {
  name: string
  color: string
}

export interface History {
  old_status?: string
  new_status: string
  changed_at: string
}
