-- 小组件表：保存每个小组件的基础信息和显示状态。
CREATE TABLE IF NOT EXISTS widgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  pinned INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 待办事项表：保存用户创建的任务内容和完成状态。
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  due_time TEXT,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 快速便签表：每个桌面便签窗口拥有独立数据，删除组件实例时同步清理其便签。
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_instance_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '临时',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (widget_instance_id) REFERENCES widgets(id) ON DELETE CASCADE
);

-- 日程提醒表：保存日程时间、提醒时间和提醒状态。
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  remind_time TEXT,
  reminded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 桌面分类表：保存桌面文件分类规则。
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  rule TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 文件路径表：保存被扫描或归类的桌面文件信息。
CREATE TABLE IF NOT EXISTS desktop_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  category_id INTEGER,
  file_type TEXT,
  modified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 旧版悬浮文件夹表：仅为已有数据库兼容保留；新版快捷收纳区使用小组件配置保存引用。
CREATE TABLE IF NOT EXISTS floating_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  widget_id INTEGER,
  name TEXT NOT NULL,
  folder_path TEXT NOT NULL,
  display_mode TEXT NOT NULL DEFAULT 'list',
  sort_mode TEXT NOT NULL DEFAULT 'modified_desc',
  display_limit INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 天气配置表：保存天气小组件的城市和缓存数据。
CREATE TABLE IF NOT EXISTS weather_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  city TEXT NOT NULL DEFAULT '北京',
  refresh_interval INTEGER NOT NULL DEFAULT 1800,
  weather_data TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_widgets_type ON widgets(type);
CREATE INDEX IF NOT EXISTS idx_widgets_visible ON widgets(visible);
CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
CREATE INDEX IF NOT EXISTS idx_notes_widget_instance ON notes(widget_instance_id);
CREATE INDEX IF NOT EXISTS idx_notes_widget_pinned_updated ON notes(widget_instance_id, is_pinned, updated_at);
CREATE INDEX IF NOT EXISTS idx_schedules_remind_time ON schedules(remind_time);
CREATE INDEX IF NOT EXISTS idx_desktop_files_category_id ON desktop_files(category_id);

-- 数据看板已下线；保留其他业务表并删除其独立配置表。
DROP TABLE IF EXISTS dashboard_settings;

-- 桌面整理记录表：保存每次整理时单个文件的移动结果，便于追踪失败原因和目标路径。
CREATE TABLE IF NOT EXISTS desktop_organize_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  source_path TEXT NOT NULL,
  target_path TEXT,
  category_id INTEGER,
  category_name TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);
