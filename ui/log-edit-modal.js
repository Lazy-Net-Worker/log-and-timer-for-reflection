"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogEditModal = void 0;
const obsidian_1 = require("obsidian");
class LogEditModal extends obsidian_1.Modal {
    constructor(app, log, onSave) {
        super(app);
        this.log = log;
        this.onSave = onSave;
    }
    onOpen() {
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
exports.LogEditModal = LogEditModal;
