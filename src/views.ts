import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import { ExportApplicationService, LogEditApplicationService, LogQueryApplicationService, TimerApplicationService } from './services';
import { PluginSettings, TaskMaster, TimerStateDTO } from './types';
import { formatDuration, taskPath } from './utils';
import { nowIso } from './utils';
import { LogEditModal } from './ui/log-edit-modal';
import { ReflectionModal } from './ui/reflection-modal';

export const TIMER_VIEW_TYPE = 'ltfr-timer-view';
export const LOG_VIEW_TYPE = 'ltfr-log-view';

export class TimerView extends ItemView {
	private elapsedEl: HTMLElement | null = null;
	private totalEl: HTMLElement | null = null;
	private remainingEl: HTMLElement | null = null;
	private statusEl: HTMLElement | null = null;
	private selectEl: HTMLSelectElement | null = null;
	private reversePomodoroBtn: HTMLButtonElement | null = null;
	private pomodoroBtn: HTMLButtonElement | null = null;
	private breakBtn: HTMLButtonElement | null = null;
	private resumeWorkBtn: HTMLButtonElement | null = null;
	private pauseBtn: HTMLButtonElement | null = null;
	private resumeBtn: HTMLButtonElement | null = null;
	private resetBtn: HTMLButtonElement | null = null;
	private messageEl: HTMLElement | null = null;
	private tasksSignature = '';
	private currentState: TimerStateDTO | null = null;
	private rafHandle: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly timerSvc: TimerApplicationService,
		private readonly openSettings: () => void,
		private readonly openLogView: () => void,
		private readonly getTimerState: () => TimerStateDTO,
		private readonly getTasks: () => TaskMaster[],
		private readonly getActiveTaskId: () => string | null,
		private readonly setSelectedTaskId: (taskId: string | null) => void,
		private readonly refreshAll: () => void,
		private readonly settings: PluginSettings,
	) {
		super(leaf);
	}

	getViewType(): string {
		return TIMER_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Log and timer';
	}

	getIcon(): string {
		return 'timer';
	}

	async onOpen(): Promise<void> {
		await this.render();
		this.updateTicker();
	}

	async onClose(): Promise<void> {
		this.stopTicker();
		await super.onClose();
	}

	async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		this.elapsedEl = null;
		this.totalEl = null;
		this.remainingEl = null;
		this.statusEl = null;
		this.selectEl = null;
		this.reversePomodoroBtn = null;
		this.pomodoroBtn = null;
		this.breakBtn = null;
		this.resumeWorkBtn = null;
		this.pauseBtn = null;
		this.resumeBtn = null;
		this.resetBtn = null;
		this.messageEl = null;

		const tasks = this.getTasks();
		this.tasksSignature = tasks.map((task) => task.id).join('|');
		this.currentState = this.getTimerState();

		contentEl.createEl('h2', { text: 'Timer' });
		this.totalEl = contentEl.createEl('div');
		this.elapsedEl = contentEl.createEl('div');
		this.remainingEl = contentEl.createEl('div');
		this.statusEl = contentEl.createEl('div');

		this.selectEl = contentEl.createEl('select');
		this.selectEl.disabled = tasks.length === 0;
		this.selectEl.createEl('option', { text: 'Select task', value: '' });
		for (const task of tasks) {
			this.selectEl.createEl('option', { text: taskPath(task), value: task.id });
		}
		this.selectEl.value = this.getActiveTaskId() ?? '';
		this.selectEl.onchange = () => {
			this.setSelectedTaskId(this.selectEl?.value || null);
			this.syncButtons();
			this.syncMessage();
		};

		const actions = contentEl.createDiv({ cls: 'ltfr-actions' });
		this.reversePomodoroBtn = actions.createEl('button', { text: 'Start reverse pomodoro' });
		this.pomodoroBtn = actions.createEl('button', { text: 'Start pomodoro' });
		this.breakBtn = actions.createEl('button', { text: 'Take break' });
		this.resumeWorkBtn = actions.createEl('button', { text: 'Resume work' });
		this.pauseBtn = actions.createEl('button', { text: 'Pause' });
		this.resumeBtn = actions.createEl('button', { text: 'Resume' });
		this.resetBtn = actions.createEl('button', { text: 'Reset' });
		const taskBtn = actions.createEl('button', { text: 'Open task settings' });
		const logBtn = actions.createEl('button', { text: 'Open logs' });

		this.reversePomodoroBtn.onclick = async () => {
			const taskId = this.selectEl?.value ?? '';
			this.applyOptimisticState({
				mode: 'inverse-pomodoro',
				status: 'running',
				elapsedSec: 0,
				sessionElapsedSec: 0,
				taskId: taskId || null,
				startTime: nowIso(new Date()),
				remainingSec: null,
				targetSec: null,
				pomodoroPhase: 'work',
				pomodoroRound: 1,
			});
			await this.timerSvc.startInversePomodoro(taskId, new Date(), this.settings);
			this.refreshAll();
		};
		this.pomodoroBtn.onclick = async () => {
			const taskId = this.selectEl?.value ?? '';
			this.applyOptimisticState({
				mode: 'pomodoro',
				status: 'running',
				elapsedSec: 0,
				sessionElapsedSec: 0,
				taskId: taskId || null,
				startTime: nowIso(new Date()),
				remainingSec: Math.round(this.settings.pomodoroWorkMinutes * 60),
				targetSec: Math.round(this.settings.pomodoroWorkMinutes * 60),
				pomodoroPhase: 'work',
				pomodoroRound: 1,
			});
			await this.timerSvc.startPomodoro(taskId, new Date(), this.settings);
			this.refreshAll();
		};
		this.breakBtn.onclick = async () => {
			await this.timerSvc.startInversePomodoroBreak(new Date(), this.settings);
			this.refreshAll();
		};
		this.resumeWorkBtn.onclick = async () => {
			await this.timerSvc.resumeInverseWork(new Date());
			this.refreshAll();
		};
		this.pauseBtn.onclick = async () => {
			const now = new Date();
			const elapsed = this.currentState
				? this.currentState.elapsedSec + Math.floor((now.getTime() - new Date(this.currentState.startTime || now).getTime()) / 1000)
				: 0;
			this.applyOptimisticState({
				status: 'paused',
				elapsedSec: elapsed,
			});
			await this.timerSvc.pause(now);
			this.refreshAll();
		};
		this.resumeBtn.onclick = async () => {
			this.applyOptimisticState({
				status: 'running',
				startTime: nowIso(new Date()),
			});
			await this.timerSvc.resume(new Date());
			this.refreshAll();
		};
		this.resetBtn.onclick = async () => {
			const resetFn = async (memo = '') => {
				this.applyOptimisticState({ status: 'idle', elapsedSec: 0, startTime: null, taskId: null });
				await this.timerSvc.reset(new Date(), memo);
				this.refreshAll();
			};

			if (this.settings.showReflectionInputOnSave) {
				new ReflectionModal(this.app, (memo) => {
					void resetFn(memo);
				}).open();
			} else {
				await resetFn();
			}
		};
		taskBtn.onclick = () => this.openSettings();
		logBtn.onclick = () => this.openLogView();

		this.messageEl = contentEl.createDiv({ cls: 'ltfr-message' });
		this.syncState();
		this.syncButtons();
		this.syncMessage();
	}

	async refresh(): Promise<void> {
		const items = this.getTasks();
		const signature = items.map((task) => task.id).join('|');
		if (signature !== this.tasksSignature) {
			await this.render();
			return;
		}
		this.currentState = this.getTimerState();
		this.syncState();
		if (this.selectEl) {
			this.selectEl.value = this.getActiveTaskId() ?? '';
		}
		this.syncButtons();
		this.syncMessage();
		this.updateTicker();
	}

	tick(): void {
		if (this.currentState && this.currentState.status === 'running' && this.currentState.startTime) {
			const elapsed = this.currentState.elapsedSec + Math.floor((Date.now() - new Date(this.currentState.startTime).getTime()) / 1000);
			const total = this.currentState.sessionElapsedSec + elapsed;
			if (this.totalEl) {
				this.totalEl.textContent = `Total: ${formatDuration(total)}`;
			}
			if (this.remainingEl && this.elapsedEl) {
				if (this.currentState.mode === 'inverse-pomodoro') {
					if (this.currentState.pomodoroPhase === 'work') {
						this.remainingEl.textContent = '';
						this.elapsedEl.textContent = `Phase: ${formatDuration(elapsed)}`
					} else {
						const remaining = this.currentState.remainingSec === null ? 0 : Math.max(0, this.currentState.remainingSec - Math.floor((Date.now() - new Date(this.currentState.startTime).getTime()) / 1000));
						this.remainingEl.textContent = `Remaining: ${formatDuration(remaining)}`;
						this.elapsedEl.textContent = '';
					}
				} else if (this.currentState.remainingSec !== null) {
					const remaining = Math.max(0, this.currentState.remainingSec - Math.floor((Date.now() - new Date(this.currentState.startTime).getTime()) / 1000));
					this.remainingEl.textContent = `Remaining: ${formatDuration(remaining)}`;
					this.elapsedEl.textContent = '';
				} else {
					this.remainingEl.textContent = '';
					this.elapsedEl.textContent = '';
				}
			}
		}
	}

	private updateTicker(): void {
		const state = this.currentState ?? this.getTimerState();
		if (state.status === 'running') {
			this.startTicker();
		} else {
			this.stopTicker();
		}
	}

	private startTicker(): void {
		this.stopTicker();
		const loop = () => {
			if (!this.contentEl.isConnected) {
				this.rafHandle = null;
				return;
			}
			this.tick();
			this.rafHandle = window.requestAnimationFrame(loop);
		};
		this.rafHandle = window.requestAnimationFrame(loop);
	}

	private stopTicker(): void {
		if (this.rafHandle !== null) {
			window.cancelAnimationFrame(this.rafHandle);
			this.rafHandle = null;
		}
	}

	private syncState(): void {
		const state = this.currentState ?? this.getTimerState();
		if (this.totalEl) this.totalEl.textContent = `Total: ${formatDuration(state.sessionElapsedSec + state.elapsedSec)}`;
		if (this.remainingEl && this.elapsedEl) {
			if (state.mode === 'inverse-pomodoro') {
				if (state.pomodoroPhase === 'work') {
					this.remainingEl.textContent = '';
					this.elapsedEl.textContent = `Phase: ${formatDuration(state.elapsedSec)}`;
				} else {
					this.remainingEl.textContent = state.remainingSec === null ? '' : `Remaining: ${formatDuration(state.remainingSec)}`;
					this.elapsedEl.textContent = '';
				}
			} else {
				this.remainingEl.textContent = state.remainingSec === null ? '' : `Remaining: ${formatDuration(state.remainingSec)}`;
				this.elapsedEl.textContent = '';
			}
		}
		if (this.statusEl) {
			const phase = (state.mode === 'pomodoro' || state.mode === 'inverse-pomodoro') && state.pomodoroPhase ? ` (${state.pomodoroPhase} ${state.pomodoroRound})` : '';
			this.statusEl.textContent =
				state.status === 'paused'
					? `Paused${phase}`
					: state.status === 'running' && state.mode === 'inverse-pomodoro' && state.pomodoroPhase === 'work'
						? `Running${phase} [count up]`
						: state.status === 'running'
							? `Running${phase}`
							: state.status === 'completed'
								? 'Completed'
								: 'Idle';
		}
	}

	private syncButtons(): void {
		const state = this.currentState ?? this.getTimerState();
		const hasSelectedTask = !!(this.selectEl?.value);
		if (this.reversePomodoroBtn) this.reversePomodoroBtn.disabled = state.status !== 'idle' || !hasSelectedTask;
		if (this.pomodoroBtn) this.pomodoroBtn.disabled = state.status !== 'idle' || !hasSelectedTask;
		if (this.breakBtn) this.breakBtn.disabled = !(state.status === 'running' && state.mode === 'inverse-pomodoro' && state.pomodoroPhase === 'work');
		if (this.resumeWorkBtn) this.resumeWorkBtn.disabled = !(state.status === 'running' && state.mode === 'inverse-pomodoro' && state.pomodoroPhase === 'break');
		if (this.pauseBtn) this.pauseBtn.disabled = state.status !== 'running';
		if (this.resumeBtn) this.resumeBtn.disabled = state.status !== 'paused';
		if (this.resetBtn) this.resetBtn.disabled = state.status === 'idle';
	}

	private syncMessage(): void {
		const state = this.currentState ?? this.getTimerState();
		const hasSelectedTask = !!(this.selectEl?.value);
		const tasksCount = this.selectEl ? this.selectEl.options.length - 1 : 0;
		if (this.messageEl) {
			if (state.status === 'idle') {
				if (tasksCount === 0) {
					this.messageEl.textContent = 'No tasks found. Please add a task in settings.';
					this.messageEl.classList.remove('is-hidden');
				} else if (!hasSelectedTask) {
					this.messageEl.textContent = 'Please select a task to start.';
					this.messageEl.classList.remove('is-hidden');
				} else {
					this.messageEl.textContent = '';
					this.messageEl.classList.add('is-hidden');
				}
			} else if (state.status === 'completed') {
				this.messageEl.textContent = 'Timer completed. Press Reset to save the session.';
				this.messageEl.classList.remove('is-hidden');
			} else {
				this.messageEl.textContent = '';
				this.messageEl.classList.add('is-hidden');
			}
		}
	}

	private applyOptimisticState(patch: Partial<TimerStateDTO>): void {
		const next = { ...(this.currentState ?? this.getTimerState()), ...patch };
		this.currentState = next;
		this.syncState();
		this.syncButtons();
		this.syncMessage();
		this.updateTicker();
		if (this.selectEl && patch.taskId !== undefined) {
			this.selectEl.value = patch.taskId ?? '';
		}
	}
}

export class LogView extends ItemView {
	private rangeType: 'today' | 'days-ago' | 'this-week' | 'weeks-ago' | 'this-month' | 'months-ago' | 'this-year' | 'years-ago' | 'date-range' | 'week-range' | 'month-range' | 'year-range' = 'today';
	private searchText = '';
	private rangeOffset = 0;
	private rangeFrom: string | null = null;
	private rangeTo: string | null = null;
	private rangeSelectEl: HTMLSelectElement | null = null;
	private fromInputEl: HTMLInputElement | null = null;
	private toInputEl: HTMLInputElement | null = null;
	private offsetInputEl: HTMLInputElement | null = null;
	private searchInputEl: HTMLInputElement | null = null;
	private listEl: HTMLElement | null = null;
	private exportBtnEl: HTMLButtonElement | null = null;
	constructor(
		leaf: WorkspaceLeaf,
		private readonly querySvc: LogQueryApplicationService,
		private readonly editSvc: LogEditApplicationService,
		private readonly exportSvc: ExportApplicationService,
		private readonly settings: PluginSettings,
		private readonly refreshAll: () => void,
	) {
		super(leaf);
	}

	getViewType(): string {
		return LOG_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Log list';
	}

	getIcon(): string {
		return 'list';
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Logs' });

		const controls = contentEl.createDiv({ cls: 'ltfr-log-controls' });
		controls.createEl('div', { text: 'Term' });
		this.rangeSelectEl = controls.createEl('select');
		for (const [value, label] of [
			['today', 'Today'],
			['days-ago', 'Days ago'],
			['this-week', 'This week'],
			['weeks-ago', 'Weeks ago'],
			['this-month', 'This month'],
			['months-ago', 'Months ago'],
			['this-year', 'This year'],
			['years-ago', 'Years ago'],
			['date-range', 'Date range'],
			['week-range', 'Week range'],
			['month-range', 'Month range'],
			['year-range', 'Year range'],
		] as const) {
			this.rangeSelectEl.createEl('option', { text: label, value });
		}
		this.rangeSelectEl.value = this.rangeType;
		this.rangeSelectEl.onchange = () => {
			this.rangeType = this.rangeSelectEl?.value as typeof this.rangeType;
			this.updateControlsState();
			void this.refreshList();
		};

		controls.createEl('div', { text: 'Range' });
		this.fromInputEl = controls.createEl('input', { type: 'date' });
		this.fromInputEl.value = this.rangeFrom ?? '';
		this.fromInputEl.onchange = () => {
			this.rangeFrom = this.fromInputEl?.value || null;
			void this.refreshList();
		};

		this.toInputEl = controls.createEl('input', { type: 'date' });
		this.toInputEl.value = this.rangeTo ?? '';
		this.toInputEl.onchange = () => {
			this.rangeTo = this.toInputEl?.value || null;
			void this.refreshList();
		};

		controls.createEl('div', { text: 'Offset' });
		this.offsetInputEl = controls.createEl('input', { type: 'number' });
		this.offsetInputEl.value = String(this.rangeOffset);
		this.offsetInputEl.onchange = () => {
			this.rangeOffset = Math.max(0, Number(this.offsetInputEl?.value) || 0);
			void this.refreshList();
		};

		controls.createEl('div', { text: 'Keyword' });
		this.searchInputEl = controls.createEl('input', { type: 'search' });
		this.searchInputEl.value = this.searchText;
		this.searchInputEl.placeholder = 'Search task or memo';
		this.searchInputEl.oninput = () => {
			this.searchText = this.searchInputEl?.value ?? '';
			void this.refreshList();
		};

		this.exportBtnEl = contentEl.createEl('button', { text: 'Export' });
		this.exportBtnEl.onclick = async () => {
			await this.exportSvc.exportWithRangeType(this.rangeType, new Date());
		};

		this.listEl = contentEl.createDiv({ cls: 'ltfr-log-list' });
		await this.refreshList();
	}

	private async refreshList(): Promise<void> {
		if (!this.listEl) return;
		this.listEl.empty();
		this.updateControlsState();
		const selectionSettings: PluginSettings = {
			...this.settings,
			exportRangeType: this.rangeType,
			exportRangeOffset: this.rangeOffset,
			exportRangeFrom: this.rangeFrom ?? '',
			exportRangeTo: this.rangeTo ?? '',
		};
		const logs = await this.querySvc.getLogsByRangeType(selectionSettings, new Date());
		const filteredLogs = logs.filter((log) => {
			const query = this.searchText.trim().toLowerCase();
			if (!query) return true;
			return `${log.taskPath} ${log.memo}`.toLowerCase().includes(query);
		});
		const allLogs = await this.querySvc.getAllLogs();

		for (const log of filteredLogs) {
			const row = this.listEl.createDiv({ cls: 'ltfr-log-row' });
			row.createEl('div', { text: `${log.taskPath} / ${log.durationText}` });
			row.createEl('div', { text: log.memo || '' });
			row.onclick = async () => {
				const original = allLogs.find((item) => item.id === log.id);
				if (!original) {
					new Notice('Log not found');
					return;
				}
				new LogEditModal(this.app, { durationSec: original.durationSec, memo: original.memo, task: original.task }, async (payload) => {
					await this.editSvc.updateDuration(original.id, payload.durationSec, new Date());
					await this.editSvc.updateMemo(original.id, payload.memo, new Date());
					await this.editSvc.updateTask(original.id, payload.task, new Date());
					await this.render();
				}).open();
			};
		}
	}

	private updateControlsState(): void {
		const usesRange = this.rangeType === 'date-range' || this.rangeType === 'week-range' || this.rangeType === 'month-range' || this.rangeType === 'year-range';
		const usesOffset = this.rangeType === 'days-ago' || this.rangeType === 'weeks-ago' || this.rangeType === 'months-ago' || this.rangeType === 'years-ago';
		if (this.fromInputEl) this.fromInputEl.disabled = !usesRange;
		if (this.toInputEl) this.toInputEl.disabled = !usesRange;
		if (this.offsetInputEl) this.offsetInputEl.disabled = !usesOffset;
		if (this.exportBtnEl) this.exportBtnEl.disabled = false;
	}
}
