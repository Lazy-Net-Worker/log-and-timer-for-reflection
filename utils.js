"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nowIso = nowIso;
exports.formatLocalTime = formatLocalTime;
exports.parseStoredDate = parseStoredDate;
exports.makeId = makeId;
exports.toTaskRef = toTaskRef;
exports.taskPath = taskPath;
exports.formatDuration = formatDuration;
exports.formatDateKey = formatDateKey;
exports.cloneLog = cloneLog;
function nowIso(now = new Date()) {
    return now.toISOString();
}
function formatLocalTime(date) {
    return date.toLocaleTimeString(Intl.DateTimeFormat().resolvedOptions().locale);
}
function parseStoredDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed;
    }
    // Backward compatibility for older locale-formatted strings.
    const timeOnly = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s?[AP]M)?$/i);
    if (timeOnly) {
        const now = new Date();
        const hours = Number(timeOnly[1]);
        const minutes = Number(timeOnly[2]);
        const seconds = Number(timeOnly[3] ?? '0');
        now.setHours(hours, minutes, seconds, 0);
        return now;
    }
    return null;
}
function makeId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}
function toTaskRef(task) {
    return {
        id: task.id,
        category: task.category,
        subcategory: task.subcategory,
        name: task.name,
    };
}
function taskPath(task) {
    return [task.category, task.subcategory, task.name].filter(Boolean).join('/');
}
function formatDuration(sec) {
    const safe = Math.max(0, Math.floor(sec));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
function formatDateKey(date) {
    const date_local = date.toLocaleDateString(Intl.DateTimeFormat().resolvedOptions().locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
    return date_local;
}
function cloneLog(log) {
    return JSON.parse(JSON.stringify(log));
}
