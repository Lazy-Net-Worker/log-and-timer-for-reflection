import { App, Modal, Setting } from 'obsidian';

export class ReflectionModal extends Modal {
	private memo = '';
	private submitted = false;

	constructor(
		app: App,
		private readonly onSubmit: (memo: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h3', { text: 'Enter reflection' });

		new Setting(contentEl)
			.setName('Memo')
			.setDesc('Enter a reflection or note for this log entry.')
			.addTextArea((text) => {
				text.setValue(this.memo).onChange((value) => {
					this.memo = value;
				});
				text.inputEl.focus();
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						this.submitted = true;
						this.onSubmit(this.memo);
						this.close();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText('Skip')
					.onClick(() => {
						this.submitted = true;
						this.onSubmit('');
						this.close();
					}),
			);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
