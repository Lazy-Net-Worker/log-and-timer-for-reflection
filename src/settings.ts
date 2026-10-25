import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { TaskMasterApplicationService } from './services';
import { PluginSettings, TaskMaster } from './types';
import { taskPath } from './utils';
import { TaskModal } from './ui/task-modal';

export const DEFAULT_SETTINGS: PluginSettings = {
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
	showReflectionInputOnSave: true,
	appendToDailyNote: false,
	inversePomodoroBreakRatio: 0.2,
	pomodoroWorkMinutes: 25,
	pomodoroBreakMinutes: 5,
	pomodoroRounds: 4,
	pomodoroInfinite: false,
};
export class ReflectionSettingTab extends PluginSettingTab {
	private deps: {
		settings: PluginSettings;
		saveSettings: () => Promise<void>;
		getTasks: () => TaskMaster[];
		taskSvc?: TaskMasterApplicationService;
		refresh: () => void;
		replaceTasks?: (tasks: TaskMaster[]) => Promise<void>;
	} | null = null;

	constructor(
		app: App,
		plugin: Plugin,
	) {
		super(app, plugin);
	}

	setDeps(deps: {
		settings: PluginSettings;
		saveSettings: () => Promise<void>;
		getTasks: () => TaskMaster[];
		taskSvc?: TaskMasterApplicationService;
		refresh: () => void;
		replaceTasks?: (tasks: TaskMaster[]) => Promise<void>;
	}): void {
		this.deps = deps;
	}

	getSettingDefinitions(): [] {
		return [];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const plugin = this.deps;
		if (!plugin) {
			containerEl.createEl('p', {
				text: 'Plugin is still initializing. Open this tab again in a moment.',
			});
			return;
		}
		const { settings, saveSettings, getTasks, taskSvc, refresh, replaceTasks } = plugin;
		if (!taskSvc || !replaceTasks) {
			containerEl.createEl('p', {
				text: 'Plugin is still initializing. Open this tab again in a moment.',
			});
			return;
		}

		new Setting(containerEl)
			.setName('Week start day')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						'0': 'Sunday',
						'1': 'Monday',
						'2': 'Tuesday',
						'3': 'Wednesday',
						'4': 'Thursday',
						'5': 'Friday',
						'6': 'Saturday',
					})
					.setValue(String(settings.weekStartDay))
					.onChange(async (value) => {
						settings.weekStartDay = Number(value) as PluginSettings['weekStartDay'];
						await saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Export file path')
			.addText((text) =>
				text.setValue(settings.exportFilePath).onChange(async (value) => {
					settings.exportFilePath = value.trim() || DEFAULT_SETTINGS.exportFilePath;
					await saveSettings();
				}),
			);

		new Setting(containerEl).setName("Log export").setHeading();

		new Setting(containerEl)
			.setName('Export range type')
			.setDesc('Select one range mode for export.')
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						'today': 'Today',
						'days-ago': 'Days ago',
						'this-week': 'This week',
						'weeks-ago': 'Weeks ago',
						'this-month': 'This month',
						'months-ago': 'Months ago',
						'this-year': 'This year',
						'years-ago': 'Years ago',
						'date-range': 'Date range',
						'week-range': 'Week range',
						'month-range': 'Month range',
						'year-range': 'Year range',
					})
					.setValue(settings.exportRangeType)
					.onChange(async (value) => {
						settings.exportRangeType = value as PluginSettings['exportRangeType'];
						await saveSettings();
						this.display();
					}),
			);

		if (settings.exportRangeType === 'date-range' || settings.exportRangeType === 'week-range' || settings.exportRangeType === 'month-range' || settings.exportRangeType === 'year-range') {
			new Setting(containerEl)
				.setName('Range from')
				.addText((text) =>
					text.setPlaceholder('2026-01-01').setValue(settings.exportRangeFrom).onChange(async (value) => {
						settings.exportRangeFrom = value.trim();
						await saveSettings();
					}),
				);
			new Setting(containerEl)
				.setName('Range to')
				.addText((text) =>
					text.setPlaceholder('2026-01-31').setValue(settings.exportRangeTo).onChange(async (value) => {
						settings.exportRangeTo = value.trim();
						await saveSettings();
					}),
				);
		}

		if (settings.exportRangeType === 'days-ago' || settings.exportRangeType === 'weeks-ago' || settings.exportRangeType === 'months-ago' || settings.exportRangeType === 'years-ago') {
			new Setting(containerEl)
				.setName('Range offset')
				.addText((text) => {
					text.inputEl.type = 'number';
					text.setValue(String(settings.exportRangeOffset)).onChange(async (value) => {
						settings.exportRangeOffset = Math.max(0, Number(value) || 0);
						await saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName('Include summary')
			.addToggle((toggle) =>
				toggle.setValue(settings.exportIncludeSummary).onChange(async (value) => {
					settings.exportIncludeSummary = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Include logs')
			.addToggle((toggle) =>
				toggle.setValue(settings.exportIncludeLogs).onChange(async (value) => {
					settings.exportIncludeLogs = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('{{SUMMARY}} template')
			.setDesc('Use {{H}}, {{MIN}}, {{SEC}}, {{TASK}}, and {{COUNT}}.')
			.addTextArea((text) =>
				text.setValue(settings.exportSummaryTemplate).onChange(async (value) => {
					settings.exportSummaryTemplate = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('{{LOGS}} template')
			.setDesc('Use {{START}}, {{END}}, {{TASK}}, {{DURATION}}, {{MEMO}}, {{YYYY}}, {{MM}}, {{DD}}.')
			.addTextArea((text) =>
				text.setValue(settings.exportLogItemTemplate).onChange(async (value) => {
					settings.exportLogItemTemplate = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Body template')
			.setDesc('Use {{SUMMARY}}, {{LOGS}}, and {{RANGE}}.')
			.addTextArea((text) =>
				text.setValue(settings.exportBodyTemplate).onChange(async (value) => {
					settings.exportBodyTemplate = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Show reflection input on save')
			.addToggle((toggle) =>
				toggle.setValue(settings.showReflectionInputOnSave).onChange(async (value) => {
					settings.showReflectionInputOnSave = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Append export to daily note')
			.setDesc('Append export to Obsidian\'s daily note.')
			.addToggle((toggle) =>
				toggle.setValue(settings.appendToDailyNote).onChange(async (value) => {
					settings.appendToDailyNote = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl).setName("Timer presets").setHeading();

		new Setting(containerEl)
			.setName('Inverse pomodoro break ratio')
			.setDesc('Example: 0.2 means 50 minutes of work becomes 10 minutes of rest.')
			.addText((text) => {
				text.inputEl.step = '0.01';
				text.setValue(String(settings.inversePomodoroBreakRatio)).onChange(async (value) => {
					settings.inversePomodoroBreakRatio = Math.max(0, Number.parseFloat(value) || DEFAULT_SETTINGS.inversePomodoroBreakRatio);
					await saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Pomodoro work minutes')
			.addText((text) => {
				text.inputEl.step = '0.1';
				text.setValue(String(settings.pomodoroWorkMinutes)).onChange(async (value) => {
					settings.pomodoroWorkMinutes = Math.max(0.1, Number.parseFloat(value) || DEFAULT_SETTINGS.pomodoroWorkMinutes);
					await saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Pomodoro break minutes')
			.addText((text) => {
				text.inputEl.step = '0.1';
				text.setValue(String(settings.pomodoroBreakMinutes)).onChange(async (value) => {
					settings.pomodoroBreakMinutes = Math.max(0.1, Number.parseFloat(value) || DEFAULT_SETTINGS.pomodoroBreakMinutes);
					await saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Pomodoro repeat count')
			.setDesc('How many work sessions to repeat before stopping.')
			.addText((text) =>
				text.setValue(String(settings.pomodoroRounds)).onChange(async (value) => {
					settings.pomodoroRounds = Math.max(1, Number(value) || DEFAULT_SETTINGS.pomodoroRounds);
					await saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Repeat forever')
			.setDesc('When enabled, pomodoro cycles continue without a fixed end.')
			.addToggle((toggle) =>
				toggle.setValue(settings.pomodoroInfinite).onChange(async (value) => {
					settings.pomodoroInfinite = value;
					await saveSettings();
				}),
			);

		new Setting(containerEl).setName("Task master").setHeading();

		new Setting(containerEl)
			.setName('Add new task')
			.addButton((button) =>
					button.setButtonText('Add').onClick(() => {
					if (!taskSvc || !replaceTasks) {
						new Notice('Plugin is still initializing.');
						return;
					}
					new TaskModal(this.app, async (input) => {
						const task = await taskSvc.create(input, new Date());
						const tasks = getTasks();
						await replaceTasks([...tasks, task]);
						refresh();
						this.display();
					}).open();
				}),
			);

		const tasks = getTasks();
		for (const task of tasks) {
			const setting = new Setting(containerEl).setName(taskPath(task)).setDesc(`${task.category} / ${task.subcategory}`);
			setting.addButton((button) =>
				button.setButtonText('Edit').onClick(() => {
					if (!taskSvc || !replaceTasks) {
						new Notice('Plugin is still initializing.');
						return;
					}
					new TaskModal(this.app, async (input) => {
						const updated = await taskSvc.update(task, input, new Date());
						const tasks = getTasks().map((item) => (item.id === updated.id ? updated : item));
						await replaceTasks(tasks);
						refresh();
						this.display();
					}, task).open();
				}),
			);
			setting.addButton((button) =>
				button.setButtonText('Delete').setWarning().onClick(async () => {
					if (!taskSvc || !replaceTasks) {
						new Notice('Plugin is still initializing.');
						return;
					}
					try {
						await taskSvc.delete(task.id);
						await replaceTasks(getTasks().filter((item) => item.id !== task.id));
						refresh();
						this.display();
					} catch (error) {
						new Notice(error instanceof Error ? error.message : 'Delete failed');
					}
				}),
			);
		}
	}
}
