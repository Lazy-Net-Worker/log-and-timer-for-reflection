import { App, Modal } from 'obsidian';
import { TaskRef } from '../types';

export class LogEditModal extends Modal {
	constructor(
		app: App,
		private readonly log: { durationSec: number; memo: string; task: TaskRef },
		private readonly onSave: (payload: { durationSec: number; memo: string; task: TaskRef }) => Promise<void>,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Edit log' });
		const duration = contentEl.createEl('input', { type: 'number', value: String(this.log.durationSec), attr: { min: '0' } });
		const memo = contentEl.createEl('textarea', { text: this.log.memo });
		const actions = contentEl.createDiv({ cls: 'ltfr-actions' });
		const save = actions.createEl('button', { text: 'Save' });
		const cancel = actions.createEl('button', { text: 'Cancel' });

		save.onclick = async () => {
			await this.onSave({
				durationSec: Math.max(0, Number(duration.value) || 0),
				memo: memo.value,
				task: this.log.task,
			});
			this.close();
		};
		cancel.onclick = () => this.close();
	}
}
