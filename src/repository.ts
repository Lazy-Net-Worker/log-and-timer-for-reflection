import { Plugin } from 'obsidian';
import { LogEntry, PluginData, TaskMaster, TimerState } from './types';
import { nowIso } from './utils';

function createEmptyTimer(): TimerState {
	return {
		status: 'idle',
		mode: 'stopwatch',
		startTime: null,
		elapsedSec: 0,
		sessionElapsedSec: 0,
		targetSec: null,
		remainingSec: null,
		pomodoroPhase: null,
		pomodoroRound: 0,
		currentTask: null,
		updatedAt: nowIso(),
	};
}

export function createEmptyPluginData(): PluginData {
	return {
		logs: [],
		tasks: [],
		timer: createEmptyTimer(),
		settings: {
			weekStartDay: 1,
			exportFilePath: 'work-log.md',
			exportRangeType: 'today',
			exportRangeFrom: '',
			exportRangeTo: '',
			exportRangeOffset: 0,
			exportRangeLength: 1,
			exportRangeUnit: 'day',
			exportIncludeSummary: true,
			exportIncludeLogs: true,
			exportSummaryTemplate: '## Summary\n{{SUMMARY}}',
			exportLogItemTemplate: '- {{START}} - {{END}} | {{TASK}} | {{DURATION}} | {{MEMO}}',
			exportBodyTemplate: '{{SUMMARY}}\n\n{{LOGS}}',
			dailyNotePathTemplate: '{{YYYY}}-{{MM}}-{{DD}}.md',
			showReflectionInputOnSave: true,
			appendToDailyNote: false,
			inversePomodoroBreakRatio: 0.2,
			pomodoroWorkMinutes: 25,
			pomodoroBreakMinutes: 5,
			pomodoroRounds: 4,
			pomodoroInfinite: false,
		},
	};
}

export class PluginDataRepository {
	private cachedData: PluginData | null = null;

	constructor(private readonly plugin: Plugin) {}

	async getAll(): Promise<PluginData> {
		if (this.cachedData) {
			return this.cachedData;
		}
		const data = (await this.plugin.loadData()) as Partial<PluginData> | null;
		this.cachedData = {
			...createEmptyPluginData(),
			...(data ?? {}),
			settings: {
				...createEmptyPluginData().settings,
				...(data?.settings ?? {}),
			},
			timer: {
				...createEmptyPluginData().timer,
				...(data?.timer ?? {}),
			},
			logs: data?.logs ?? [],
			tasks: data?.tasks ?? [],
		};
		return this.cachedData;
	}

	async save(data: PluginData): Promise<void> {
		this.cachedData = data;
		const backup = { ...data };
		delete backup.backup;
		await this.plugin.saveData({ ...data, backup });
	}

	getCached(): PluginData {
		if (!this.cachedData) {
			throw new Error('Cache not initialized. Call getAll() first.');
		}
		return this.cachedData;
	}
}

export interface LogRepository {
	findAll(): Promise<LogEntry[]>;
	findById(id: string): Promise<LogEntry | null>;
	save(log: LogEntry): Promise<void>;
	update(log: LogEntry): Promise<void>;
}

export interface TaskRepository {
	findAll(): Promise<TaskMaster[]>;
	findById(id: string): Promise<TaskMaster | null>;
	save(task: TaskMaster): Promise<void>;
	delete(id: string): Promise<void>;
}

export interface TimerRepository {
	get(): Promise<TimerState>;
	save(state: TimerState): Promise<void>;
}

export class PluginLogRepository implements LogRepository {
	constructor(private readonly repo: PluginDataRepository) {}

	async findAll(): Promise<LogEntry[]> {
		const data = await this.repo.getAll();
		return data.logs;
	}

	async findById(id: string): Promise<LogEntry | null> {
		const data = await this.repo.getAll();
		return data.logs.find((log) => log.id === id) ?? null;
	}

	async save(log: LogEntry): Promise<void> {
		await this.repo.save({
			...(await this.repo.getAll()),
			logs: [...(await this.findAll()).filter((item) => item.id !== log.id), log],
		});
	}

	async update(log: LogEntry): Promise<void> {
		await this.save(log);
	}
}

export class PluginTaskRepository implements TaskRepository {
	constructor(private readonly repo: PluginDataRepository) {}

	async findAll(): Promise<TaskMaster[]> {
		return (await this.repo.getAll()).tasks;
	}

	async findById(id: string): Promise<TaskMaster | null> {
		const data = await this.repo.getAll();
		return data.tasks.find((task) => task.id === id) ?? null;
	}

	async save(task: TaskMaster): Promise<void> {
		const data = await this.repo.getAll();
		const tasks = [...data.tasks.filter((item) => item.id !== task.id), task];
		await this.repo.save({ ...data, tasks });
	}

	async delete(id: string): Promise<void> {
		const data = await this.repo.getAll();
		await this.repo.save({ ...data, tasks: data.tasks.filter((task) => task.id !== id) });
	}
}

export class PluginTimerRepository implements TimerRepository {
	constructor(private readonly repo: PluginDataRepository) {}

	async get(): Promise<TimerState> {
		return (await this.repo.getAll()).timer;
	}

	async save(state: TimerState): Promise<void> {
		const data = await this.repo.getAll();
		await this.repo.save({ ...data, timer: state });
	}
}
