"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskModal = void 0;
const obsidian_1 = require("obsidian");
class TaskModal extends obsidian_1.Modal {
    constructor(app, onSave, task) {
        super(app);
        this.onSave = onSave;
        this.task = task;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: this.task ? 'Edit task' : 'Add task' });
        const category = contentEl.createEl('input', { type: 'text', placeholder: 'Category', value: this.task?.category ?? '' });
        const subcategory = contentEl.createEl('input', { type: 'text', placeholder: 'Subcategory', value: this.task?.subcategory ?? '' });
        const name = contentEl.createEl('input', { type: 'text', placeholder: 'Name', value: this.task?.name ?? '' });
        const actions = contentEl.createDiv({ cls: 'ltfr-actions' });
        const save = actions.createEl('button', { text: 'Save' });
        const cancel = actions.createEl('button', { text: 'Cancel' });
        save.onclick = async () => {
            await this.onSave({
                category: category.value.trim(),
                subcategory: subcategory.value.trim(),
                name: name.value.trim(),
            });
            this.close();
        };
        cancel.onclick = () => this.close();
    }
}
exports.TaskModal = TaskModal;
