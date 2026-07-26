import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
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
	dailyNotePathTemplate: '{{YYYY}}-{{MM}}-{{DD}}.md',
	showReflectionInputOnSave: true,
	appendToDailyNote: false,
	inversePomodoroBreakRatio: 0.2,
	pomodoroWorkMinutes: 25,
	pomodoroBreakMinutes: 5,
	pomodoroRounds: 4,
	pomodoroInfinite: false,
};
export class ReflectionSettingTab extends PluginSettingTab {
	constructor(
		app: App,
	private readonly plugin: {
			settings: PluginSettings;
			saveSettings: () => Promise<void>;
			getTasks: () => TaskMaster[];
			taskSvc: TaskMasterApplicationService;
			refresh: () => void;
			replaceTasks: (tasks: TaskMaster[]) => Promise<void>;
		},
	) {
		super(app, plugin as any);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

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
					.setValue(String(this.plugin.settings.weekStartDay))
					.onChange(async (value) => {
						this.plugin.settings.weekStartDay = Number(value) as PluginSettings['weekStartDay'];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Export file path')
			.addText((text) =>
				text.setValue(this.plugin.settings.exportFilePath).onChange(async (value) => {
					this.plugin.settings.exportFilePath = value.trim() || DEFAULT_SETTINGS.exportFilePath;
					await this.plugin.saveSettings();
				}),
			);

		containerEl.createEl('h3', { text: 'Log export' });

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
					.setValue(this.plugin.settings.exportRangeType)
					.onChange(async (value) => {
						this.plugin.settings.exportRangeType = value as PluginSettings['exportRangeType'];
						await this.plugin.saveSettings();
						this.display();
					}),
			);

		if (this.plugin.settings.exportRangeType === 'date-range' || this.plugin.settings.exportRangeType === 'week-range' || this.plugin.settings.exportRangeType === 'month-range' || this.plugin.settings.exportRangeType === 'year-range') {
			new Setting(containerEl)
				.setName('Range from')
				.addText((text) =>
					text.setPlaceholder('2026-01-01').setValue(this.plugin.settings.exportRangeFrom).onChange(async (value) => {
						this.plugin.settings.exportRangeFrom = value.trim();
						await this.plugin.saveSettings();
					}),
				);
			new Setting(containerEl)
				.setName('Range to')
				.addText((text) =>
					text.setPlaceholder('2026-01-31').setValue(this.plugin.settings.exportRangeTo).onChange(async (value) => {
						this.plugin.settings.exportRangeTo = value.trim();
						await this.plugin.saveSettings();
					}),
				);
		}

		if (this.plugin.settings.exportRangeType === 'days-ago' || this.plugin.settings.exportRangeType === 'weeks-ago' || this.plugin.settings.exportRangeType === 'months-ago' || this.plugin.settings.exportRangeType === 'years-ago') {
			new Setting(containerEl)
				.setName('Range offset')
				.addText((text) => {
					text.inputEl.type = 'number';
					text.setValue(String(this.plugin.settings.exportRangeOffset)).onChange(async (value) => {
						this.plugin.settings.exportRangeOffset = Math.max(0, Number(value) || 0);
						await this.plugin.saveSettings();
					});
				});
		}

		new Setting(containerEl)
			.setName('Include summary')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.exportIncludeSummary).onChange(async (value) => {
					this.plugin.settings.exportIncludeSummary = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Include logs')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.exportIncludeLogs).onChange(async (value) => {
					this.plugin.settings.exportIncludeLogs = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('{{SUMMARY}} template')
			.setDesc('Use {{H}}, {{MIN}}, {{SEC}}, {{TASK}}, and {{COUNT}}.')
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.exportSummaryTemplate).onChange(async (value) => {
					this.plugin.settings.exportSummaryTemplate = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('{{LOGS}} template')
			.setDesc('Use {{START}}, {{END}}, {{TASK}}, {{DURATION}}, {{MEMO}}, {{YYYY}}, {{MM}}, {{DD}}.')
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.exportLogItemTemplate).onChange(async (value) => {
					this.plugin.settings.exportLogItemTemplate = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Body template')
			.setDesc('Use {{SUMMARY}}, {{LOGS}}, and {{RANGE}}.')
			.addTextArea((text) =>
				text.setValue(this.plugin.settings.exportBodyTemplate).onChange(async (value) => {
					this.plugin.settings.exportBodyTemplate = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Daily note path template')
			.setDesc('Example: folder/{{YYYY}}-{{MM}}-{{DD}} or {{YYYY}}/{{MM}}/{{DD}}.md')
			.addText((text) =>
				text.setValue(this.plugin.settings.dailyNotePathTemplate).onChange(async (value) => {
					this.plugin.settings.dailyNotePathTemplate = value.trim() || DEFAULT_SETTINGS.dailyNotePathTemplate;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Show reflection input on save')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showReflectionInputOnSave).onChange(async (value) => {
					this.plugin.settings.showReflectionInputOnSave = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Append export to daily note')
			.setDesc('When enabled, export writes to today\'s daily note instead of the configured file path.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.appendToDailyNote).onChange(async (value) => {
					this.plugin.settings.appendToDailyNote = value;
					await this.plugin.saveSettings();
				}),
			);

		containerEl.createEl('h3', { text: 'Timer presets' });

		new Setting(containerEl)
			.setName('Inverse pomodoro break ratio')
			.setDesc('Example: 0.2 means 50 minutes of work becomes 10 minutes of rest.')
			.addText((text) => {
				text.inputEl.step = '0.01';
				text.setValue(String(this.plugin.settings.inversePomodoroBreakRatio)).onChange(async (value) => {
					this.plugin.settings.inversePomodoroBreakRatio = Math.max(0, Number.parseFloat(value) || DEFAULT_SETTINGS.inversePomodoroBreakRatio);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Pomodoro work minutes')
			.addText((text) => {
				text.inputEl.step = '0.1';
				text.setValue(String(this.plugin.settings.pomodoroWorkMinutes)).onChange(async (value) => {
					this.plugin.settings.pomodoroWorkMinutes = Math.max(0.1, Number.parseFloat(value) || DEFAULT_SETTINGS.pomodoroWorkMinutes);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Pomodoro break minutes')
			.addText((text) => {
				text.inputEl.step = '0.1';
				text.setValue(String(this.plugin.settings.pomodoroBreakMinutes)).onChange(async (value) => {
					this.plugin.settings.pomodoroBreakMinutes = Math.max(0.1, Number.parseFloat(value) || DEFAULT_SETTINGS.pomodoroBreakMinutes);
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Pomodoro repeat count')
			.setDesc('How many work sessions to repeat before stopping.')
			.addText((text) =>
				text.setValue(String(this.plugin.settings.pomodoroRounds)).onChange(async (value) => {
					this.plugin.settings.pomodoroRounds = Math.max(1, Number(value) || DEFAULT_SETTINGS.pomodoroRounds);
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Repeat forever')
			.setDesc('When enabled, pomodoro cycles continue without a fixed end.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.pomodoroInfinite).onChange(async (value) => {
					this.plugin.settings.pomodoroInfinite = value;
					await this.plugin.saveSettings();
				}),
			);

		containerEl.createEl('h3', { text: 'Task master' });

		new Setting(containerEl)
			.setName('Add new task')
			.addButton((button) =>
				button.setButtonText('Add').onClick(() => {
					new TaskModal(this.app, async (input) => {
						const task = await this.plugin.taskSvc.create(input, new Date());
						const tasks = this.plugin.getTasks();
						await this.plugin.replaceTasks([...tasks, task]);
						this.plugin.refresh();
						this.display();
					}).open();
				}),
			);

		const tasks = this.plugin.getTasks();
		for (const task of tasks) {
			const setting = new Setting(containerEl).setName(taskPath(task)).setDesc(`${task.category} / ${task.subcategory}`);
			setting.addButton((button) =>
				button.setButtonText('Edit').onClick(() => {
					new TaskModal(this.app, async (input) => {
						const updated = await this.plugin.taskSvc.update(task, input, new Date());
						const tasks = this.plugin.getTasks().map((item) => (item.id === updated.id ? updated : item));
						await this.plugin.replaceTasks(tasks);
						this.plugin.refresh();
						this.display();
					}, task).open();
				}),
			);
			setting.addButton((button) =>
				button.setButtonText('Delete').setWarning().onClick(async () => {
					try {
						await this.plugin.taskSvc.delete(task.id);
						await this.plugin.replaceTasks(this.plugin.getTasks().filter((item) => item.id !== task.id));
						this.plugin.refresh();
						this.display();
					} catch (error) {
						new Notice(error instanceof Error ? error.message : 'Delete failed');
					}
				}),
			);
		}
	}
}
