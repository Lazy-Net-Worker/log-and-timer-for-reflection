import { Notice, Vault } from 'obsidian';
import { AggregatedLog, LogEntry, LogViewModel, PluginSettings, TaskMaster, TaskRef, TimerState, TimerStateDTO } from './types';
import { formatDateKey, formatDuration, makeId, nowIso, parseStoredDate, taskPath, toTaskRef } from './utils';
import { LogRepository, TaskRepository, TimerRepository } from './repository';
import { buildExportContent, cloneExportSettings, filterLogsByRange, getSummaryTaskCount, getSummaryTaskNames, getSummaryTotalDuration, renderTemplate, resolveExportRange, shouldUseDailyNote } from './export';

function createLog(start: Date, end: Date, task: TaskRef, memo = '', id = makeId('log')): LogEntry {
	const durationSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
	return {
		id,
		startTime: nowIso(start),
		endTime: nowIso(end),
		durationSec,
		task,
		memo,
		createdAt: nowIso(),
		updatedAt: nowIso(),
	};
}

export class TimerApplicationService {
	constructor(
		private readonly logRepo: LogRepository,
		private readonly taskRepo: TaskRepository,
		private readonly timerRepo: TimerRepository,
	) {}

	async start(taskId: string, now: Date): Promise<void> {
		await this.startStopwatch(taskId, now);
	}

	async startStopwatch(taskId: string, now: Date): Promise<void> {
		const task = await this.taskRepo.findById(taskId);
		if (!task) throw new Error('Task not found');
		const state = await this.timerRepo.get();
		if (state.status !== 'idle') return;
		await this.timerRepo.save({
			status: 'running',
			mode: 'stopwatch',
			startTime: nowIso(now),
			elapsedSec: 0,
			sessionElapsedSec: 0,
			targetSec: null,
			remainingSec: null,
			pomodoroPhase: null,
			pomodoroRound: 0,
			currentTask: toTaskRef(task),
			updatedAt: nowIso(now),
		});
	}

	async startPomodoro(taskId: string, now: Date, settings: PluginSettings): Promise<void> {
		const task = await this.taskRepo.findById(taskId);
		if (!task) throw new Error('Task not found');
		const state = await this.timerRepo.get();
		if (state.status !== 'idle') return;
		const remainingSec = Math.max(1, Math.round(settings.pomodoroWorkMinutes * 60));
		await this.timerRepo.save({
			status: 'running',
			mode: 'pomodoro',
			startTime: nowIso(now),
			elapsedSec: 0,
			sessionElapsedSec: 0,
			targetSec: remainingSec,
			remainingSec,
			pomodoroPhase: 'work',
			pomodoroRound: 1,
			currentTask: toTaskRef(task),
			updatedAt: nowIso(now),
		});
	}

	async startInversePomodoro(taskId: string, now: Date, settings: PluginSettings): Promise<void> {
		const task = await this.taskRepo.findById(taskId);
		if (!task) throw new Error('Task not found');
		const state = await this.timerRepo.get();
		if (state.status !== 'idle') return;
		await this.timerRepo.save({
			status: 'running',
			mode: 'inverse-pomodoro',
			startTime: nowIso(now),
			elapsedSec: 0,
			sessionElapsedSec: 0,
			targetSec: null,
			remainingSec: null,
			pomodoroPhase: 'work',
			pomodoroRound: 1,
			currentTask: toTaskRef(task),
			updatedAt: nowIso(now),
		});
	}

	async startInversePomodoroBreak(now: Date, settings: PluginSettings): Promise<void> {
		const state = await this.timerRepo.get();
		if (state.mode !== 'inverse-pomodoro' || state.status !== 'running' || state.pomodoroPhase !== 'work' || !state.startTime || !state.currentTask) return;
		const startedAt = parseStoredDate(state.startTime);
		if (!startedAt) return;
		const workElapsedSec = state.elapsedSec + Math.floor((now.getTime() - startedAt.getTime()) / 1000);
		const breakSec = Math.max(1, Math.round(workElapsedSec * settings.inversePomodoroBreakRatio));
		await this.timerRepo.save({
			...state,
			status: 'running',
			startTime: nowIso(now),
			elapsedSec: 0,
			sessionElapsedSec: state.sessionElapsedSec + workElapsedSec,
			targetSec: breakSec,
			remainingSec: breakSec,
			pomodoroPhase: 'break',
			pomodoroRound: state.pomodoroRound,
			updatedAt: nowIso(now),
		});
	}

	async pause(now: Date): Promise<void> {
		const state = await this.timerRepo.get();
		if (state.status !== 'running' || !state.startTime) return;
		const startedAt = parseStoredDate(state.startTime);
		if (!startedAt) return;
		const phaseElapsed = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
		const remainingSec = state.remainingSec === null ? null : Math.max(0, state.remainingSec - phaseElapsed);
		await this.timerRepo.save({ ...state, status: 'paused', startTime: nowIso(now), elapsedSec: phaseElapsed, sessionElapsedSec: state.sessionElapsedSec + phaseElapsed, remainingSec, updatedAt: nowIso(now) });
	}

	async resume(now: Date): Promise<void> {
		const state = await this.timerRepo.get();
		if (state.status !== 'paused') return;
		await this.timerRepo.save({ ...state, status: 'running', startTime: nowIso(now), updatedAt: nowIso(now) });
	}

	async reset(now: Date, memo = ''): Promise<void> {
		const state = await this.timerRepo.get();
		if (state.status === 'idle' || !state.currentTask) return;
		await this.logRepo.save(this.finalize(state, now, memo));
		await this.timerRepo.save({ status: 'idle', mode: 'stopwatch', startTime: null, elapsedSec: 0, sessionElapsedSec: 0, targetSec: null, remainingSec: null, pomodoroPhase: null, pomodoroRound: 0, currentTask: null, updatedAt: nowIso(now) });
	}

	async resumeInverseWork(now: Date): Promise<void> {
		const state = await this.timerRepo.get();
		if (state.mode !== 'inverse-pomodoro' || state.status !== 'running' || state.pomodoroPhase !== 'break') return;
		const startedAt = parseStoredDate(state.startTime) ?? now;
		const breakElapsedSec = state.elapsedSec + Math.floor((now.getTime() - startedAt.getTime()) / 1000);
		await this.timerRepo.save({
			...state,
			startTime: nowIso(now),
			elapsedSec: 0,
			sessionElapsedSec: state.sessionElapsedSec + breakElapsedSec,
			targetSec: null,
			remainingSec: null,
			pomodoroPhase: 'work',
			updatedAt: nowIso(now),
		});
	}

	async changeTask(taskId: string, now: Date, memo = ''): Promise<void> {
		const state = await this.timerRepo.get();
		const task = await this.taskRepo.findById(taskId);
		if (!task) throw new Error('Task not found');
		if (state.currentTask?.id === taskId) return;
		if (state.status !== 'idle' && state.currentTask && state.startTime) {
			await this.logRepo.save(this.finalize(state, now, memo));
		}
		await this.timerRepo.save({
			status: state.status,
			mode: state.mode,
			startTime: state.status === 'running' ? nowIso(now) : state.startTime,
			elapsedSec: state.status === 'running' ? 0 : state.status === 'paused' ? 0 : state.elapsedSec,
			sessionElapsedSec: state.sessionElapsedSec,
			targetSec: state.targetSec,
			remainingSec: state.remainingSec,
			pomodoroPhase: state.pomodoroPhase,
			pomodoroRound: state.pomodoroRound,
			currentTask: toTaskRef(task),
			updatedAt: nowIso(now),
		});
	}

	async handleDateChange(now: Date): Promise<boolean> {
		const state = await this.timerRepo.get();
		if (state.status === 'idle' || !state.currentTask || !state.startTime) return false;
		const startedAt = parseStoredDate(state.startTime);
		if (!startedAt) return false;
		const startDate = formatDateKey(startedAt);
		const currentDate = formatDateKey(now);
		if (startDate === currentDate) return false;
		await this.logRepo.save(this.finalize(state, now));
		await this.timerRepo.save({
			status: state.status,
			mode: state.mode,
			startTime: nowIso(now),
			elapsedSec: 0,
			sessionElapsedSec: state.sessionElapsedSec,
			targetSec: state.targetSec,
			remainingSec: state.remainingSec,
			pomodoroPhase: state.pomodoroPhase,
			pomodoroRound: state.pomodoroRound,
			currentTask: state.currentTask,
			updatedAt: nowIso(now),
		});
		return true;
	}

	async tickCountdown(now: Date, settings: PluginSettings): Promise<boolean> {
		const state = await this.timerRepo.get();
		if (state.status !== 'running' || !state.startTime || state.mode === 'stopwatch') return false;
		const startedAt = parseStoredDate(state.startTime);
		if (!startedAt) return false;
		const elapsedSinceStart = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
		if (state.mode === 'inverse-pomodoro' && state.pomodoroPhase === 'work') {
			return false;
		}
		const remainingSec = Math.max(0, (state.remainingSec ?? 0) - elapsedSinceStart);
		if (remainingSec > 0) return false;
		if (state.mode === 'inverse-pomodoro' || state.mode === 'pomodoro') {
			const isWork = state.pomodoroPhase === 'work';
			const nextRound = isWork ? state.pomodoroRound : state.pomodoroRound + 1;
			const roundsLimit = settings.pomodoroInfinite ? Infinity : Math.max(1, Math.round(settings.pomodoroRounds));
			if (!isWork && nextRound > roundsLimit) {
			await this.timerRepo.save({
				...state,
				status: 'completed',
				startTime: nowIso(now),
				elapsedSec: state.elapsedSec + elapsedSinceStart,
				sessionElapsedSec: state.sessionElapsedSec,
				remainingSec: 0,
				updatedAt: nowIso(now),
			});
				new Notice(state.mode === 'pomodoro' ? 'Pomodoro finished' : 'Reverse pomodoro finished');
				return true;
			}

			const nextPhase = isWork ? 'break' : 'work';
			const nextRemainingSec =
				state.mode === 'inverse-pomodoro'
					? isWork
						? Math.max(1, Math.round((state.elapsedSec + elapsedSinceStart) * settings.inversePomodoroBreakRatio))
						: null
					: Math.max(1, Math.round((isWork ? settings.pomodoroBreakMinutes : settings.pomodoroWorkMinutes) * 60));
			await this.timerRepo.save({
				...state,
				startTime: nowIso(now),
				elapsedSec: 0,
				sessionElapsedSec: state.sessionElapsedSec + elapsedSinceStart,
				targetSec: nextRemainingSec,
				remainingSec: nextRemainingSec,
				pomodoroPhase: nextPhase,
				pomodoroRound: nextRound,
				updatedAt: nowIso(now),
			});
			new Notice(nextPhase === 'break' ? 'Break started' : 'Work started');
			return true;
		}

		return false;
	}

	async onPluginUnload(now: Date): Promise<void> {
		const state = await this.timerRepo.get();
		if (state.status !== 'idle' && state.currentTask && state.startTime) {
			await this.logRepo.save(this.finalize(state, now));
		}
		await this.timerRepo.save({ status: 'idle', mode: 'stopwatch', startTime: null, elapsedSec: 0, sessionElapsedSec: 0, targetSec: null, remainingSec: null, pomodoroPhase: null, pomodoroRound: 0, currentTask: null, updatedAt: nowIso(now) });
	}

	getStateDTO(state: TimerState): TimerStateDTO {
		return {
			status: state.status,
			mode: state.mode,
			elapsedSec:
				state.status === 'running' && state.startTime
					? state.elapsedSec + Math.floor((Date.now() - (parseStoredDate(state.startTime)?.getTime() ?? Date.now())) / 1000)
					: state.elapsedSec,
			sessionElapsedSec: state.sessionElapsedSec,
			remainingSec:
				state.status === 'running' && state.startTime && state.remainingSec !== null
					? Math.max(0, state.remainingSec - Math.floor((Date.now() - (parseStoredDate(state.startTime)?.getTime() ?? Date.now())) / 1000))
					: state.remainingSec,
			targetSec: state.targetSec,
			pomodoroPhase: state.pomodoroPhase,
			pomodoroRound: state.pomodoroRound,
			taskName: state.currentTask ? taskPath(state.currentTask) : null,
			taskId: state.currentTask?.id ?? null,
			startTime: state.startTime,
		};
	}

	private finalize(state: TimerState, now: Date, memo = ''): LogEntry {
		const start = parseStoredDate(state.startTime) ?? now;
		const elapsed =
			state.mode === 'stopwatch'
				? state.status === 'running'
					? state.elapsedSec + Math.floor((now.getTime() - start.getTime()) / 1000)
					: state.elapsedSec
				: state.sessionElapsedSec +
					(state.status === 'running'
						? state.elapsedSec + Math.floor((now.getTime() - start.getTime()) / 1000)
						: state.elapsedSec);
		const end = new Date(start.getTime() + elapsed * 1000);
		return createLog(start, end, state.currentTask!, memo);
	}
}

export class TaskMasterApplicationService {
	constructor(
		private readonly taskRepo: TaskRepository,
		private readonly timerRepo: TimerRepository,
	) {}

	async create(input: Omit<TaskMaster, 'id' | 'createdAt' | 'updatedAt'>, now: Date): Promise<TaskMaster> {
		const task: TaskMaster = { ...input, id: makeId('task'), createdAt: nowIso(now), updatedAt: nowIso(now) };
		await this.taskRepo.save(task);
		return task;
	}

	async update(task: TaskMaster, input: Partial<TaskMaster>, now: Date): Promise<TaskMaster> {
		const updated = { ...task, ...input, updatedAt: nowIso(now) };
		await this.taskRepo.save(updated);
		return updated;
	}

	async delete(taskId: string): Promise<void> {
		const timer = await this.timerRepo.get();
		if (timer.currentTask?.id === taskId) throw new Error('Running task cannot be deleted');
		await this.taskRepo.delete(taskId);
	}
}

export class LogEditApplicationService {
	constructor(private readonly logRepo: LogRepository) {}

	async updateDuration(logId: string, durationSec: number, now: Date): Promise<void> {
		const log = await this.logRepo.findById(logId);
		if (!log) throw new Error('Log not found');
		const start = parseStoredDate(log.startTime);
		if (!start) throw new Error('Invalid log start time');
		const updated = { ...log, durationSec, endTime: nowIso(new Date(start.getTime() + durationSec * 1000)), updatedAt: nowIso(now) };
		await this.logRepo.update(updated);
	}

	async updateTask(logId: string, task: TaskRef, now: Date): Promise<void> {
		const log = await this.logRepo.findById(logId);
		if (!log) throw new Error('Log not found');
		await this.logRepo.update({ ...log, task, updatedAt: nowIso(now) });
	}

	async updateMemo(logId: string, memo: string, now: Date): Promise<void> {
		const log = await this.logRepo.findById(logId);
		if (!log) throw new Error('Log not found');
		await this.logRepo.update({ ...log, memo, updatedAt: nowIso(now) });
	}
}

export class LogQueryApplicationService {
	constructor(private readonly logRepo: LogRepository) {}

	async getAllLogs(): Promise<LogEntry[]> {
		return this.logRepo.findAll();
	}

	async getLogsByRangeType(settings: PluginSettings, referenceDate = new Date()): Promise<LogViewModel[]> {
		const range = resolveExportRange(settings, referenceDate);
		const logs = filterLogsByRange(await this.logRepo.findAll(), range);
		return logs
			.sort((a, b) => (parseStoredDate(b.startTime)?.getTime() ?? 0) - (parseStoredDate(a.startTime)?.getTime() ?? 0))
			.map((log) => ({
				id: log.id,
				date: (parseStoredDate(log.startTime) ?? new Date()).toLocaleDateString(),
				durationText: formatDuration(log.durationSec),
				taskPath: taskPath(log.task),
				memo: log.memo,
			}));
	}

	async getLogsByPeriod(period: 'day' | 'week' | 'month' | 'year', referenceDate: Date, weekStartDay: number): Promise<LogViewModel[]> {
		const logs = await this.logRepo.findAll();
		const filtered = logs.filter((log) => {
			const startedAt = parseStoredDate(log.startTime);
			return startedAt ? this.matchesPeriod(startedAt, period, referenceDate, weekStartDay) : false;
		});
		return filtered
			.sort((a, b) => (parseStoredDate(b.startTime)?.getTime() ?? 0) - (parseStoredDate(a.startTime)?.getTime() ?? 0))
			.map((log) => ({
				id: log.id,
				date: (parseStoredDate(log.startTime) ?? new Date()).toLocaleDateString(),
				durationText: formatDuration(log.durationSec),
				taskPath: taskPath(log.task),
				memo: log.memo,
			}));
	}

	async getAggregatedLogs(period: 'day' | 'week' | 'month' | 'year', referenceDate: Date, weekStartDay: number): Promise<AggregatedLog[]> {
		const logs = await this.logRepo.findAll();
		const filtered = logs.filter((log) => {
			const startedAt = parseStoredDate(log.startTime);
			return startedAt ? this.matchesPeriod(startedAt, period, referenceDate, weekStartDay) : false;
		});
		const groups = new Map<string, AggregatedLog>();
		for (const log of filtered) {
			const key = period === 'day' ? (parseStoredDate(log.startTime) ?? new Date()).toLocaleDateString() : period;
			const group = groups.get(key) ?? { key, totalDurationSec: 0, tasks: [] };
			group.totalDurationSec += log.durationSec;
			group.tasks.push({ taskPath: taskPath(log.task), durationSec: log.durationSec });
			groups.set(key, group);
		}
		return [...groups.values()];
	}

	private matchesPeriod(date: Date, period: 'day' | 'week' | 'month' | 'year', referenceDate: Date, weekStartDay: number): boolean {
		if (period === 'day') return formatDateKey(date) === formatDateKey(referenceDate);
		if (period === 'month') return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
		if (period === 'year') return date.getFullYear() === referenceDate.getFullYear();
		const ref = new Date(referenceDate);
		const diff = (ref.getDay() - weekStartDay + 7) % 7;
		const start = new Date(ref);
		start.setDate(ref.getDate() - diff);
		start.setHours(0, 0, 0, 0);
		const end = new Date(start);
		end.setDate(start.getDate() + 7);
		return date >= start && date < end;
	}
}

export class ExportApplicationService {
	constructor(
		private readonly logRepo: LogRepository,
		private readonly vault: Vault,
		private readonly settings: PluginSettings,
	) {}

	async exportCurrentSelection(referenceDate = new Date()): Promise<void> {
		const range = resolveExportRange(this.settings, referenceDate);
		const logs = filterLogsByRange(await this.logRepo.findAll(), range);
		const markdown = buildExportContent(this.settings, logs, range);
		await this.writeExportFile(markdown, range.from, shouldUseDailyNote(this.settings.exportRangeType));
		new Notice(`Log exported: ${range.label}`);
	}

	async exportWithRangeType(rangeType: PluginSettings['exportRangeType'], referenceDate = new Date()): Promise<void> {
		const exportSettings = cloneExportSettings(this.settings, rangeType);
		const range = resolveExportRange(exportSettings, referenceDate);
		const logs = filterLogsByRange(await this.logRepo.findAll(), range);
		const markdown = buildExportContent(exportSettings, logs, range);
		await this.writeExportFile(markdown, range.from, shouldUseDailyNote(rangeType));
		new Notice(`Log exported: ${range.label}`);
	}

	async exportPeriod(period: 'day' | 'week' | 'month' | 'year', referenceDate: Date): Promise<void> {
		const logs = await this.logRepo.findAll();
		const filtered = logs.filter((log) => {
			const startedAt = parseStoredDate(log.startTime);
			return startedAt ? this.matchesPeriod(startedAt, period, referenceDate) : false;
		});
		const range = { from: referenceDate, to: referenceDate, label: period };
		const markdown = buildExportContent(this.settings, filtered, range);
		await this.writeExportFile(markdown, referenceDate, false);
		new Notice(`${period} log exported`);
	}

	async labelExportPeriod(referenceDate = new Date()): Promise<void> {
		const range = resolveExportRange(this.settings, referenceDate);
		const label = `${range.label} (${referenceDate.toLocaleDateString()})`;
		const file = this.resolveOutputFile(referenceDate, shouldUseDailyNote(this.settings.exportRangeType));
		const existing = await this.vault.adapter.read(file).catch(() => '');
		const separator = existing && !existing.endsWith('\n') ? '\n' : '';
		const header = `\n\n## Export period\n${label}\n`;
		await this.writeRaw(file, `${existing}${separator}${header}`);
		new Notice(`Export period labeled: ${label}`);
	}

	async showSummaryTaskNames(referenceDate = new Date()): Promise<void> {
		const logs = await this.getLogsForSelection(referenceDate);
		new Notice(getSummaryTaskNames(logs));
	}

	async showSummaryTotalDuration(referenceDate = new Date()): Promise<void> {
		const logs = await this.getLogsForSelection(referenceDate);
		new Notice(getSummaryTotalDuration(logs));
	}

	async showSummaryTaskCount(referenceDate = new Date()): Promise<void> {
		const logs = await this.getLogsForSelection(referenceDate);
		new Notice(getSummaryTaskCount(logs));
	}

	private async getLogsForSelection(referenceDate: Date): Promise<LogEntry[]> {
		const range = resolveExportRange(this.settings, referenceDate);
		return filterLogsByRange(await this.logRepo.findAll(), range);
	}

	private async writeExportFile(content: string, referenceDate: Date, useDailyNote: boolean): Promise<void> {
		const file = this.resolveOutputFile(referenceDate, useDailyNote);
		await this.writeRaw(file, content);
	}

	private resolveOutputFile(referenceDate: Date, useDailyNote: boolean): string {
		const file = useDailyNote ? this.renderDailyNotePath(referenceDate) : this.settings.exportFilePath;
		return this.normalizePath(file);
	}

	private async writeRaw(file: string, content: string): Promise<void> {
		const parts = file.split('/');
		if (parts.length > 1) {
			await this.ensureDirectory(parts.slice(0, -1).join('/'));
		}
		const existing = await this.vault.adapter.read(file).catch(() => '');
		const separator = existing && !existing.endsWith('\n') ? '\n' : '';
		await this.vault.adapter.write(file, `${existing}${separator}${content}\n`);
	}

	private async ensureDirectory(path: string): Promise<void> {
		const normalized = this.normalizePath(path);
		const segments = normalized.split('/').filter(Boolean);
		let current = '';
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!(await this.vault.adapter.exists(current))) {
				await this.vault.adapter.mkdir(current);
			}
		}
	}

	private normalizePath(path: string): string {
		return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '');
	}

	private renderDailyNotePath(referenceDate: Date): string {
		return renderTemplate(this.settings.dailyNotePathTemplate, {
			YYYY: String(referenceDate.getFullYear()),
			MM: String(referenceDate.getMonth() + 1).padStart(2, '0'),
			DD: String(referenceDate.getDate()).padStart(2, '0'),
		});
	}

	private matchesPeriod(date: Date, period: 'day' | 'week' | 'month' | 'year', referenceDate: Date): boolean {
		if (period === 'day') return date.toDateString() === referenceDate.toDateString();
		if (period === 'month') return date.getFullYear() === referenceDate.getFullYear() && date.getMonth() === referenceDate.getMonth();
		if (period === 'year') return date.getFullYear() === referenceDate.getFullYear();
		return true;
	}
}
