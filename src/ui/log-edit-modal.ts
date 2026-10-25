import { App, Modal } from 'obsidian';
import { TaskMaster, TaskRef } from '../types';
import { taskPath, toTaskRef } from '../utils';

export class LogEditModal extends Modal {
	constructor(
		app: App,
		private readonly log: { durationSec: number; memo: string; task: TaskRef },
		private readonly tasks: TaskMaster[],
		private readonly onSave: (payload: { durationSec: number; memo: string; task: TaskRef }) => Promise<void>,
		private readonly onDelete: () => Promise<void>,
		private readonly options?: { title?: string; submitLabel?: string; allowDelete?: boolean },
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: this.options?.title ?? 'Edit log' });
		contentEl.createDiv({ text: 'Duration (HH:MM:SS)' });
		const durationRow = contentEl.createDiv({ cls: 'ltfr-duration-inputs' });
		const duration_hours = durationRow.createEl('input', { type: 'number', value: String(Math.floor(this.log.durationSec / 3600)) });
		duration_hours.style.width = '50px';
		duration_hours.style.whiteSpace = 'nowrap';
		durationRow.createSpan({ text: ':' });
		const duration_minutes = durationRow.createEl('input', { type: 'number', value: String(Math.floor((this.log.durationSec % 3600) / 60)) });
		duration_minutes.style.width = '50px';
		duration_minutes.style.whiteSpace = 'nowrap';
		durationRow.createSpan({ text: ':' });
		const duration_seconds = durationRow.createEl('input', { type: 'number', value: String(this.log.durationSec % 60) });
		duration_seconds.style.width = '50px';
		contentEl.createEl('br');
		contentEl.createDiv({ text: 'Memo' });
		const memo = contentEl.createEl('textarea', { text: this.log.memo });
		contentEl.createDiv({ text: 'Task' });
		const taskSelect = contentEl.createEl('select');
		taskSelect.createEl('option', { text: 'Keep current task', value: '' });
		for (const task of this.tasks) {
			taskSelect.createEl('option', { text: taskPath(task), value: task.id });
		}
		taskSelect.value = this.tasks.some((task) => task.id === this.log.task.id) ? this.log.task.id : '';
		const actions = contentEl.createDiv({ cls: 'ltfr-actions' });
		const save = actions.createEl('button', { text: this.options?.submitLabel ?? 'Save' });
		const cancel = actions.createEl('button', { text: 'Cancel' });
		if (this.options?.allowDelete !== false) {
			const remove = actions.createEl('button', { text: 'Delete' });
			remove.onclick = async () => {
				if (!window.confirm('Delete this log?')) return;
				await this.onDelete();
				this.close();
			};
		}

		save.onclick = async () => {
			const selectedTask = this.tasks.find((task) => task.id === taskSelect.value);
			const hours = Number(duration_hours.value || 0);
			const minutes = Number(duration_minutes.value || 0);
			const seconds = Number(duration_seconds.value || 0);
			const nextDurationSec = Math.max(0, hours * 3600 + minutes * 60 + seconds);
			await this.onSave({
				durationSec: nextDurationSec,
				memo: memo.value,
				task: selectedTask ? toTaskRef(selectedTask) : this.log.task,
			});
			this.close();
		};
		cancel.onclick = () => this.close();
	}
}
