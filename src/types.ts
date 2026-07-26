export type TimerStatus = 'idle' | 'running' | 'paused' | 'completed';
export type TimerMode = 'stopwatch' | 'inverse-pomodoro' | 'pomodoro';
export type PomodoroPhase = 'work' | 'break';

export interface TaskRef {
	id: string;
	category: string;
	subcategory: string;
	name: string;
}

export interface LogEntry {
	id: string;
	startTime: string;
	endTime: string;
	durationSec: number;
	task: TaskRef;
	memo: string;
	createdAt: string;
	updatedAt: string;
}

export interface TaskMaster {
	id: string;
	category: string;
	subcategory: string;
	name: string;
	createdAt: string;
	updatedAt: string;
}

export interface TimerState {
	status: TimerStatus;
	mode: TimerMode;
	startTime: string | null;
	elapsedSec: number;
	sessionElapsedSec: number;
	targetSec: number | null;
	remainingSec: number | null;
	pomodoroPhase: PomodoroPhase | null;
	pomodoroRound: number;
	currentTask: TaskRef | null;
	updatedAt: string;
}

export interface PluginSettings {
	weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
	exportFilePath: string;
	exportRangeType: ExportRangeType;
	exportRangeFrom: string;
	exportRangeTo: string;
	exportRangeOffset: number;
	exportRangeLength: number;
	exportRangeUnit: ExportRangeUnit;
	exportIncludeSummary: boolean;
	exportIncludeLogs: boolean;
	exportSummaryTemplate: string;
	exportLogItemTemplate: string;
	exportBodyTemplate: string;
	dailyNotePathTemplate: string;
	showReflectionInputOnSave: boolean;
	appendToDailyNote: boolean;
	inversePomodoroBreakRatio: number;
	pomodoroWorkMinutes: number;
	pomodoroBreakMinutes: number;
	pomodoroRounds: number;
	pomodoroInfinite: boolean;
}

export type ExportRangeType =
	| 'custom-range'
	| 'date-range'
	| 'week-range'
	| 'month-range'
	| 'year-range'
	| 'today'
	| 'days-ago'
	| 'this-week'
	| 'weeks-ago'
	| 'this-month'
	| 'months-ago'
	| 'this-year'
	| 'years-ago';

export type ExportRangeUnit = 'day' | 'week' | 'month' | 'year';

export interface PluginData {
	logs: LogEntry[];
	tasks: TaskMaster[];
	timer: TimerState;
	settings: PluginSettings;
	backup?: Omit<PluginData, 'backup'>;
}

export interface TimerStateDTO {
	status: TimerStatus;
	mode: TimerMode;
	elapsedSec: number;
	sessionElapsedSec: number;
	remainingSec: number | null;
	targetSec: number | null;
	pomodoroPhase: PomodoroPhase | null;
	pomodoroRound: number;
	taskName: string | null;
	taskId: string | null;
	startTime?: string | null;
}

export interface LogViewModel {
	id: string;
	date: string;
	durationText: string;
	taskPath: string;
	memo: string;
}

export interface AggregatedLog {
	key: string;
	totalDurationSec: number;
	tasks: { taskPath: string; durationSec: number }[];
}
