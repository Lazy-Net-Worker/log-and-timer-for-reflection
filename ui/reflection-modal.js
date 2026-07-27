"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReflectionModal = void 0;
const obsidian_1 = require("obsidian");
class ReflectionModal extends obsidian_1.Modal {
    constructor(app, onSubmit) {
        super(app);
        this.onSubmit = onSubmit;
        this.memo = '';
        this.submitted = false;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: 'Enter reflection' });
        new obsidian_1.Setting(contentEl)
            .setName('Memo')
            .setDesc('Enter a reflection or note for this log entry.')
            .addTextArea((text) => {
            text.setValue(this.memo).onChange((value) => {
                this.memo = value;
            });
            text.inputEl.focus();
        });
        new obsidian_1.Setting(contentEl)
            .addButton((btn) => btn
            .setButtonText('Save')
            .setCta()
            .onClick(() => {
            this.submitted = true;
            this.onSubmit(this.memo);
            this.close();
        }))
            .addButton((btn) => btn
            .setButtonText('Skip')
            .onClick(() => {
            this.submitted = true;
            this.onSubmit('');
            this.close();
        }));
    }
    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
exports.ReflectionModal = ReflectionModal;
