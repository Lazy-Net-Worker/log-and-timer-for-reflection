import { ItemView, Notice, WorkspaceLeaf, setIcon } from 'obsidian';
import { ExportApplicationService, LogEditApplicationService, LogQueryApplicationService, TimerApplicationService } from './services';
import { PluginSettings, TaskMaster, TimerStateDTO } from './types';
import { formatDuration, nowIso, taskPath, toTaskRef } from './utils';
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
	private resizeObserver: ResizeObserver | null = null;

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

		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const width = entry.contentRect.width;
				const height = entry.contentRect.height;
				if (width === 0 || height === 0) continue;
				const scale = Math.min(width / 300, height / 600);
				const clampedScale = Math.max(0.6, Math.min(2.0, scale));
				this.contentEl.style.setProperty('--ui-scale', String(clampedScale));

				const actionsEl = this.contentEl.querySelector('.ltfr-actions-grid');
				if (actionsEl) {
					if (width < 280) {
						actionsEl.classList.add('is-narrow');
					} else {
						actionsEl.classList.remove('is-narrow');
					}
				}
			}
		});
		this.resizeObserver.observe(this.contentEl);
	}

	async onClose(): Promise<void> {
		this.stopTicker();
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
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

		const container = contentEl.createDiv({ cls: 'ltfr-timer-container' });
		container.createEl('h2', { text: 'Timer' });

		// Display Card
		const displayCard = container.createDiv({ cls: 'ltfr-timer-display-card' });
		this.statusEl = displayCard.createDiv({ cls: 'ltfr-status-badge' });
		this.remainingEl = displayCard.createDiv({ cls: 'ltfr-timer-large-time' });
		this.elapsedEl = displayCard.createDiv({ cls: 'ltfr-timer-sub-time' });
		this.totalEl = displayCard.createDiv({ cls: 'ltfr-timer-sub-time' });

		// Task Selector
		const selectorWrap = container.createDiv({ cls: 'ltfr-task-selector-wrap' });
		selectorWrap.createEl('label', { text: 'Active Task' });
		this.selectEl = selectorWrap.createEl('select');
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

		// Actions Grid
		const actions = container.createDiv({ cls: 'ltfr-actions-grid' });
		this.reversePomodoroBtn = actions.createEl('button', { cls: 'ltfr-btn-accent' });
		setIcon(this.reversePomodoroBtn, 'play');
		this.reversePomodoroBtn.createSpan({ text: 'Start reverse pomodoro' });

		this.pomodoroBtn = actions.createEl('button');
		setIcon(this.pomodoroBtn, 'timer');
		this.pomodoroBtn.createSpan({ text: 'Start pomodoro' });

		this.breakBtn = actions.createEl('button', { cls: 'ltfr-btn-accent' });
		setIcon(this.breakBtn, 'coffee');
		this.breakBtn.createSpan({ text: 'Take break' });

		this.resumeWorkBtn = actions.createEl('button', { cls: 'ltfr-btn-accent' });
		setIcon(this.resumeWorkBtn, 'play');
		this.resumeWorkBtn.createSpan({ text: 'Resume work' });

		this.pauseBtn = actions.createEl('button');
		setIcon(this.pauseBtn, 'pause');
		this.pauseBtn.createSpan({ text: 'Pause' });

		this.resumeBtn = actions.createEl('button', { cls: 'ltfr-btn-accent' });
		setIcon(this.resumeBtn, 'play');
		this.resumeBtn.createSpan({ text: 'Resume' });

		this.resetBtn = actions.createEl('button', { cls: 'mod-warning' });
		setIcon(this.resetBtn, 'rotate-ccw');
		this.resetBtn.createSpan({ text: 'Reset' });

		const taskBtn = actions.createEl('button');
		setIcon(taskBtn, 'settings');
		taskBtn.createSpan({ text: 'Settings' });

		const logBtn = actions.createEl('button');
		setIcon(logBtn, 'list');
		logBtn.createSpan({ text: 'Logs' });

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

		this.messageEl = container.createDiv({ cls: 'ltfr-message' });
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
						this.remainingEl.textContent = formatDuration(elapsed);
						this.elapsedEl.textContent = 'Count up';
					} else {
						const remaining = this.currentState.remainingSec === null ? 0 : Math.max(0, this.currentState.remainingSec - Math.floor((Date.now() - new Date(this.currentState.startTime).getTime()) / 1000));
						this.remainingEl.textContent = formatDuration(remaining);
						this.elapsedEl.textContent = 'Break';
					}
				} else if (this.currentState.remainingSec !== null) {
					const remaining = Math.max(0, this.currentState.remainingSec - Math.floor((Date.now() - new Date(this.currentState.startTime).getTime()) / 1000));
					this.remainingEl.textContent = formatDuration(remaining);
					this.elapsedEl.textContent = 'Pomodoro';
				} else {
					this.remainingEl.textContent = '--:--';
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
					this.remainingEl.textContent = formatDuration(state.elapsedSec);
					this.elapsedEl.textContent = 'Count up';
				} else {
					this.remainingEl.textContent = state.remainingSec === null ? '--:--' : formatDuration(state.remainingSec);
					this.elapsedEl.textContent = 'Break';
				}
			} else {
				this.remainingEl.textContent = state.remainingSec === null ? '--:--' : formatDuration(state.remainingSec);
				this.elapsedEl.textContent = state.mode === 'pomodoro' ? 'Pomodoro' : '';
			}
		}
		if (this.statusEl) {
			const phase = (state.mode === 'pomodoro' || state.mode === 'inverse-pomodoro') && state.pomodoroPhase ? ` (${state.pomodoroPhase} ${state.pomodoroRound})` : '';
			this.statusEl.textContent =
				state.status === 'paused'
					? `Paused${phase}`
					: state.status === 'running' && state.mode === 'inverse-pomodoro' && state.pomodoroPhase === 'work'
						? `Running${phase}`
						: state.status === 'running'
							? `Running${phase}`
							: state.status === 'completed'
								? 'Completed'
								: 'Idle';
			
			this.statusEl.className = 'ltfr-status-badge';
			if (state.status === 'paused') {
				this.statusEl.classList.add('ltfr-status-paused');
			} else if (state.status === 'running') {
				this.statusEl.classList.add('ltfr-status-running');
			} else if (state.status === 'completed') {
				this.statusEl.classList.add('ltfr-status-completed');
			} else {
				this.statusEl.classList.add('ltfr-status-idle');
			}
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
				this.messageEl.textContent = 'Timer completed. Press reset to save the session.';
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
	private addLogBtnEl: HTMLButtonElement | null = null;
	private resizeObserver: ResizeObserver | null = null;
	constructor(
		leaf: WorkspaceLeaf,
		private readonly querySvc: LogQueryApplicationService,
		private readonly editSvc: LogEditApplicationService,
		private readonly exportSvc: ExportApplicationService,
		private readonly settings: PluginSettings,
		private readonly getTasks: () => TaskMaster[],
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

		this.resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const width = entry.contentRect.width;
				const height = entry.contentRect.height;
				if (width === 0 || height === 0) continue;
				const scale = Math.min(width / 300, height / 600);
				const clampedScale = Math.max(0.6, Math.min(2.0, scale));
				this.contentEl.style.setProperty('--ui-scale', String(clampedScale));
			}
		});
		this.resizeObserver.observe(this.contentEl);
	}

	async onClose(): Promise<void> {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		await super.onClose();
	}

	async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		
		const container = contentEl.createDiv({ cls: 'ltfr-log-container' });
		container.createEl('h2', { text: 'Logs' });

		// Controls Grid
		const controls = container.createDiv({ cls: 'ltfr-log-controls-grid' });
		
		controls.createDiv({ text: 'Term' });
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

		controls.createDiv({ text: 'Range' });
		const rangeInputWrap = container.createDiv({ cls: 'ltfr-log-date-range-inputs' });
		
		this.fromInputEl = rangeInputWrap.createEl('input', { type: 'date' });
		this.fromInputEl.value = this.rangeFrom ?? '';
		this.fromInputEl.onchange = () => {
			this.rangeFrom = this.fromInputEl?.value || null;
			void this.refreshList();
		};

		this.toInputEl = rangeInputWrap.createEl('input', { type: 'date' });
		this.toInputEl.value = this.rangeTo ?? '';
		this.toInputEl.onchange = () => {
			this.rangeTo = this.toInputEl?.value || null;
			void this.refreshList();
		};

		controls.createDiv({ text: 'Offset' });
		this.offsetInputEl = controls.createEl('input', { type: 'number' });
		this.offsetInputEl.value = String(this.rangeOffset);
		this.offsetInputEl.onchange = () => {
			this.rangeOffset = Math.max(0, Number(this.offsetInputEl?.value) || 0);
			void this.refreshList();
		};

		controls.createDiv({ text: 'Keyword' });
		this.searchInputEl = controls.createEl('input', { type: 'search' });
		this.searchInputEl.value = this.searchText;
		this.searchInputEl.placeholder = 'Search task or memo';
		this.searchInputEl.oninput = () => {
			this.searchText = this.searchInputEl?.value ?? '';
			void this.refreshList();
		};

		// Actions
		const actions = container.createDiv({ cls: 'ltfr-actions-grid' });
		this.exportBtnEl = actions.createEl('button');
		setIcon(this.exportBtnEl, 'download');
		this.exportBtnEl.createSpan({ text: 'Export' });
		this.exportBtnEl.onclick = async () => {
			await this.exportSvc.exportWithRangeType(this.rangeType, new Date());
		};
		this.addLogBtnEl = actions.createEl('button', { cls: 'ltfr-btn-accent' });
		setIcon(this.addLogBtnEl, 'plus');
		this.addLogBtnEl.createSpan({ text: 'Add log' });
		this.addLogBtnEl.onclick = async () => {
			const tasks = this.getTasks();
			if (tasks.length === 0) {
				new Notice('No tasks available. Add a task first in settings.');
				return;
			}
			const defaultTask = tasks[0];
			if (!defaultTask) {
				new Notice('No tasks available. Add a task first in settings.');
				return;
			}
			new LogEditModal(
				this.app,
				{ durationSec: 0, memo: '', task: toTaskRef(defaultTask) },
				tasks,
				async (payload) => {
					await this.editSvc.create(payload, new Date());
					await this.render();
				},
				async () => undefined,
				{ title: 'Add log', submitLabel: 'Add', allowDelete: false },
			).open();
		};

		this.listEl = container.createDiv({ cls: 'ltfr-log-list' });
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
		const tasks = this.getTasks();

		for (const log of filteredLogs) {
			const card = this.listEl.createDiv({ cls: 'ltfr-log-card' });
			
			const header = card.createDiv({ cls: 'ltfr-log-card-header' });
			header.createDiv({ text: log.taskPath, cls: 'ltfr-log-card-task' });
			header.createDiv({ text: log.durationText, cls: 'ltfr-log-card-duration' });
			
			if (log.memo) {
				card.createDiv({ text: log.memo, cls: 'ltfr-log-card-memo' });
			}
			
			card.onclick = async () => {
				const original = allLogs.find((item) => item.id === log.id);
				if (!original) {
					new Notice('Log not found');
					return;
				}
				new LogEditModal(
					this.app,
					{ durationSec: original.durationSec, memo: original.memo, task: original.task },
					tasks,
					async (payload) => {
						await this.editSvc.updateDuration(original.id, payload.durationSec, new Date());
						await this.editSvc.updateMemo(original.id, payload.memo, new Date());
						await this.editSvc.updateTask(original.id, payload.task, new Date());
						await this.render();
					},
					async () => {
						await this.editSvc.delete(original.id);
						await this.render();
					},
				).open();
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
