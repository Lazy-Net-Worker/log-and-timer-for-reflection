import { Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, ReflectionSettingTab } from './settings';
import {
	PluginDataRepository,
	PluginLogRepository,
	PluginTaskRepository,
	PluginTimerRepository,
} from './repository';
import {
	ExportApplicationService,
	LogEditApplicationService,
	LogQueryApplicationService,
	TaskMasterApplicationService,
	TimerApplicationService,
} from './services';
import { PluginSettings, TaskMaster, TimerStateDTO } from './types';
import { LOG_VIEW_TYPE, LogView, TIMER_VIEW_TYPE, TimerView } from './views';

export default class ReflectionPlugin extends Plugin {
	settings!: PluginSettings;
	private dataRepo!: PluginDataRepository;
	private logRepo!: PluginLogRepository;
	private taskRepo!: PluginTaskRepository;
	private timerRepo!: PluginTimerRepository;
	private timerSvc!: TimerApplicationService;
	private taskSvc!: TaskMasterApplicationService;
	private logEditSvc!: LogEditApplicationService;
	private querySvc!: LogQueryApplicationService;
	private exportSvc!: ExportApplicationService;
	private timerState!: TimerStateDTO;
	private taskCache: TaskMaster[] = [];
	private selectedTaskId: string | null = null;

	async onload(): Promise<void> {
		this.dataRepo = new PluginDataRepository(this);
		const data = await this.dataRepo.getAll();
		this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };

		this.logRepo = new PluginLogRepository(this.dataRepo);
		this.taskRepo = new PluginTaskRepository(this.dataRepo);
		this.timerRepo = new PluginTimerRepository(this.dataRepo);
		this.timerSvc = new TimerApplicationService(this.logRepo, this.taskRepo, this.timerRepo);
		this.taskSvc = new TaskMasterApplicationService(this.taskRepo, this.timerRepo);
		this.logEditSvc = new LogEditApplicationService(this.logRepo);
		this.querySvc = new LogQueryApplicationService(this.logRepo);
		this.exportSvc = new ExportApplicationService(this.logRepo, this.app.vault, this.settings);
		this.timerState = this.timerSvc.getStateDTO(data.timer);
		this.taskCache = data.tasks ?? [];
		this.selectedTaskId = this.timerState.taskId;

		await this.dataRepo.save({ ...data, settings: this.settings });

		this.registerView(TIMER_VIEW_TYPE, (leaf) => new TimerView(
			leaf,
			this.timerSvc,
			() => void this.openSettingsTab(),
			() => void this.openLogView(),
			() => this.getTimerState(),
			() => this.getTasks(),
			() => this.getActiveTaskId(),
			(taskId) => this.setSelectedTaskId(taskId),
			() => this.refreshViews(),
			this.settings,
		));
		this.registerView(LOG_VIEW_TYPE, (leaf) => new LogView(leaf, this.querySvc, this.logEditSvc, this.exportSvc, this.settings, () => this.refreshViews()));

		this.addRibbonIcon('timer', 'Open timer', () => void this.openTimerView());
		this.addCommand({ id: 'open-timer-view', name: 'Open timer view', callback: () => void this.openTimerView() });
		this.addCommand({ id: 'open-log-view', name: 'Open log view', callback: () => void this.openLogView() });
		this.addCommand({ id: 'open-task-settings', name: 'Open task settings', callback: () => void this.openSettingsTab() });
		this.addCommand({ id: 'export-current-period', name: 'Export current period', callback: () => void this.exportSvc.exportCurrentSelection(new Date()) });
		this.addCommand({ id: 'export-current-day', name: 'Export today logs', callback: () => void this.exportSvc.exportPeriod('day', new Date()) });
		this.addCommand({ id: 'export-current-week', name: 'Export current week logs', callback: () => void this.exportSvc.exportPeriod('week', new Date()) });
		this.addCommand({ id: 'export-current-month', name: 'Export current month logs', callback: () => void this.exportSvc.exportPeriod('month', new Date()) });
		this.addCommand({ id: 'export-current-year', name: 'Export current year logs', callback: () => void this.exportSvc.exportPeriod('year', new Date()) });
		this.addCommand({ id: 'label-export-period', name: 'Label export period', callback: () => void this.exportSvc.labelExportPeriod(new Date()) });
		this.addCommand({ id: 'show-summary-task-names', name: 'Show summary task names', callback: () => void this.exportSvc.showSummaryTaskNames(new Date()) });
		this.addCommand({ id: 'show-summary-total-duration', name: 'Show summary total duration', callback: () => void this.exportSvc.showSummaryTotalDuration(new Date()) });
		this.addCommand({ id: 'show-summary-task-count', name: 'Show summary task count', callback: () => void this.exportSvc.showSummaryTaskCount(new Date()) });
		this.addSettingTab(new ReflectionSettingTab(this.app, this as any));

		this.app.workspace.onLayoutReady(() => {
			this.refreshViews();
		});

		this.registerInterval(window.setInterval(() => {
			void (async () => {
				const now = new Date();
				const changed = await this.timerSvc.handleDateChange(now);
				const countdownChanged = await this.timerSvc.tickCountdown(now, this.settings);
				if (changed || countdownChanged) {
					this.refreshViews();
				}
			})();
		}, 1000));
	}

	async onunload(): Promise<void> {
		await this.timerSvc.onPluginUnload(new Date());
	}

	async saveSettings(): Promise<void> {
		const data = this.dataRepo.getCached();
		await this.dataRepo.save({ ...data, settings: this.settings });
	}

	getTasks(): TaskMaster[] {
		return this.taskCache;
	}

	refresh(): void {
		this.refreshViews();
	}

	private refreshViews(): void {
		const data = this.dataRepo.getCached();
		this.timerState = this.timerSvc.getStateDTO(data.timer);
		this.taskCache = data.tasks ?? [];
		if (this.timerState.taskId) {
			this.selectedTaskId = this.timerState.taskId;
		}
		for (const leaf of this.app.workspace.getLeavesOfType(TIMER_VIEW_TYPE)) {
			(leaf.view as any)?.refresh?.();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(LOG_VIEW_TYPE)) {
			(leaf.view as any)?.render?.();
		}
	}

	private getTimerState(): TimerStateDTO {
		const data = this.dataRepo.getCached();
		return this.timerSvc.getStateDTO(data.timer);
	}

	private async openTimerView(): Promise<void> {
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: TIMER_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	private async openLogView(): Promise<void> {
		const leaf = this.app.workspace.getLeaf(true);
		await leaf.setViewState({ type: LOG_VIEW_TYPE, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	private async openSettingsTab(): Promise<void> {
		const setting = (this.app as any).setting;
		setting.open();
		setting.openTabById(this.manifest.id);
	}

	private getActiveTaskId(): string | null {
		return this.selectedTaskId ?? this.timerState.taskId;
	}

	private setSelectedTaskId(taskId: string | null): void {
		this.selectedTaskId = taskId;
	}

	async replaceTasks(tasks: TaskMaster[]): Promise<void> {
		this.taskCache = tasks;
		const data = this.dataRepo.getCached();
		await this.dataRepo.save({ ...data, settings: this.settings, tasks });
		this.refreshViews();
	}
}
