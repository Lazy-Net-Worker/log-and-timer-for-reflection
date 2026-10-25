"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LogEditModal = void 0;
const obsidian_1 = require("obsidian");
const utils_1 = require("../utils");
class LogEditModal extends obsidian_1.Modal {
    constructor(app, log, tasks, onSave, onDelete, options) {
        super(app);
        this.log = log;
        this.tasks = tasks;
        this.onSave = onSave;
        this.onDelete = onDelete;
        this.options = options;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: this.options?.title ?? 'Edit log' });
        const duration = contentEl.createEl('input', { type: 'number', value: String(this.log.durationSec), attr: { min: '0' } });
        const memo = contentEl.createEl('textarea', { text: this.log.memo });
        contentEl.createDiv({ text: 'Task' });
        const taskSelect = contentEl.createEl('select');
        taskSelect.createEl('option', { text: 'Keep current task', value: '' });
        for (const task of this.tasks) {
            taskSelect.createEl('option', { text: (0, utils_1.taskPath)(task), value: task.id });
        }
        taskSelect.value = this.tasks.some((task) => task.id === this.log.task.id) ? this.log.task.id : '';
        const actions = contentEl.createDiv({ cls: 'ltfr-actions' });
        const save = actions.createEl('button', { text: this.options?.submitLabel ?? 'Save' });
        const cancel = actions.createEl('button', { text: 'Cancel' });
        if (this.options?.allowDelete !== false) {
            const remove = actions.createEl('button', { text: 'Delete' });
            remove.onclick = async () => {
                if (!window.confirm('Delete this log?'))
                    return;
                await this.onDelete();
                this.close();
            };
        }
        save.onclick = async () => {
            const selectedTask = this.tasks.find((task) => task.id === taskSelect.value);
            await this.onSave({
                durationSec: Math.max(0, Number(duration.value) || 0),
                memo: memo.value,
                task: selectedTask ? (0, utils_1.toTaskRef)(selectedTask) : this.log.task,
            });
            this.close();
        };
        cancel.onclick = () => this.close();
    }
}
exports.LogEditModal = LogEditModal;
