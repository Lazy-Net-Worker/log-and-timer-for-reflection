"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveExportRange = resolveExportRange;
exports.shouldUseDailyNote = shouldUseDailyNote;
exports.cloneExportSettings = cloneExportSettings;
exports.filterLogsByRange = filterLogsByRange;
exports.summarizeLogs = summarizeLogs;
exports.renderSummaryMarkdown = renderSummaryMarkdown;
exports.renderSummaryTemplate = renderSummaryTemplate;
exports.renderLogItemsMarkdown = renderLogItemsMarkdown;
exports.renderTemplate = renderTemplate;
exports.buildExportContent = buildExportContent;
exports.getSummaryTaskNames = getSummaryTaskNames;
exports.getSummaryTotalDuration = getSummaryTotalDuration;
exports.getSummaryTaskCount = getSummaryTaskCount;
const utils_1 = require("./utils");
function resolveExportRange(settings, referenceDate = new Date()) {
    const now = new Date(referenceDate);
    now.setMilliseconds(0);
    const startOfDay = (date) => {
        const copy = new Date(date);
        copy.setHours(0, 0, 0, 0);
        return copy;
    };
    const endOfDay = (date) => {
        const copy = startOfDay(date);
        copy.setDate(copy.getDate() + 1);
        return copy;
    };
    const startOfWeek = (date) => {
        const copy = startOfDay(date);
        const diff = (copy.getDay() - settings.weekStartDay + 7) % 7;
        copy.setDate(copy.getDate() - diff);
        return copy;
    };
    const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
    const startOfYear = (date) => new Date(date.getFullYear(), 0, 1);
    const addUnit = (date, count, unit) => {
        const copy = new Date(date);
        if (unit === 'day')
            copy.setDate(copy.getDate() + count);
        if (unit === 'week')
            copy.setDate(copy.getDate() + count * 7);
        if (unit === 'month')
            copy.setMonth(copy.getMonth() + count);
        if (unit === 'year')
            copy.setFullYear(copy.getFullYear() + count);
        return copy;
    };
    const parseDate = (value) => {
        const parsed = value ? new Date(value) : null;
        return parsed && !Number.isNaN(parsed.getTime()) ? startOfDay(parsed) : null;
    };
    const rangeType = settings.exportRangeType;
    if (rangeType === 'date-range') {
        const from = parseDate(settings.exportRangeFrom) ?? startOfDay(now);
        const to = parseDate(settings.exportRangeTo) ?? from;
        return { from, to: endOfDay(to), label: `${(0, utils_1.formatDateKey)(from)} - ${(0, utils_1.formatDateKey)(to)}` };
    }
    if (rangeType === 'week-range') {
        const from = parseDate(settings.exportRangeFrom) ?? startOfWeek(now);
        const to = parseDate(settings.exportRangeTo) ?? addUnit(from, 6, 'day');
        return { from, to: endOfDay(to), label: `${(0, utils_1.formatDateKey)(from)} - ${(0, utils_1.formatDateKey)(to)}` };
    }
    if (rangeType === 'month-range') {
        const from = parseDate(settings.exportRangeFrom) ?? startOfMonth(now);
        const to = parseDate(settings.exportRangeTo) ?? new Date(from.getFullYear(), from.getMonth() + 1, 0);
        return { from, to: endOfDay(to), label: `${(0, utils_1.formatDateKey)(from)} - ${(0, utils_1.formatDateKey)(to)}` };
    }
    if (rangeType === 'year-range') {
        const from = parseDate(settings.exportRangeFrom) ?? startOfYear(now);
        const to = parseDate(settings.exportRangeTo) ?? new Date(from.getFullYear(), 11, 31);
        return { from, to: endOfDay(to), label: `${(0, utils_1.formatDateKey)(from)} - ${(0, utils_1.formatDateKey)(to)}` };
    }
    if (rangeType === 'today')
        return { from: startOfDay(now), to: endOfDay(now), label: (0, utils_1.formatDateKey)(now) };
    if (rangeType === 'days-ago') {
        const from = startOfDay(addUnit(now, -Math.max(0, settings.exportRangeOffset), 'day'));
        return { from, to: endOfDay(from), label: (0, utils_1.formatDateKey)(from) };
    }
    if (rangeType === 'this-week') {
        const from = startOfWeek(now);
        return { from, to: addUnit(from, 7, 'day'), label: `${(0, utils_1.formatDateKey)(from)} - ${(0, utils_1.formatDateKey)(addUnit(from, 6, 'day'))}` };
    }
    if (rangeType === 'weeks-ago') {
        const from = startOfWeek(addUnit(now, -Math.max(0, settings.exportRangeOffset), 'week'));
        return { from, to: addUnit(from, 7, 'day'), label: `${(0, utils_1.formatDateKey)(from)} - ${(0, utils_1.formatDateKey)(addUnit(from, 6, 'day'))}` };
    }
    if (rangeType === 'this-month') {
        const from = startOfMonth(now);
        return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1), label: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}` };
    }
    if (rangeType === 'months-ago') {
        const from = startOfMonth(addUnit(now, -Math.max(0, settings.exportRangeOffset), 'month'));
        return { from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1), label: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}` };
    }
    if (rangeType === 'this-year') {
        const from = startOfYear(now);
        return { from, to: new Date(from.getFullYear() + 1, 0, 1), label: `${from.getFullYear()}` };
    }
    if (rangeType === 'years-ago') {
        const from = startOfYear(addUnit(now, -Math.max(0, settings.exportRangeOffset), 'year'));
        return { from, to: new Date(from.getFullYear() + 1, 0, 1), label: `${from.getFullYear()}` };
    }
    return { from: startOfDay(now), to: endOfDay(now), label: (0, utils_1.formatDateKey)(now) };
}
function shouldUseDailyNote(rangeType) {
    return rangeType === 'today' || rangeType === 'days-ago';
}
function cloneExportSettings(settings, rangeType) {
    return { ...settings, exportRangeType: rangeType };
}
function filterLogsByRange(logs, range) {
    return logs.filter((log) => {
        const startedAt = (0, utils_1.parseStoredDate)(log.startTime);
        return startedAt ? startedAt >= range.from && startedAt < range.to : false;
    });
}
function summarizeLogs(logs) {
    const groups = new Map();
    for (const log of logs) {
        const key = (0, utils_1.taskPath)(log.task);
        const group = groups.get(key) ?? { key, totalDurationSec: 0, tasks: [] };
        group.totalDurationSec += log.durationSec;
        group.tasks.push({ taskPath: (0, utils_1.taskPath)(log.task), durationSec: log.durationSec });
        groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.totalDurationSec - a.totalDurationSec);
}
function renderSummaryMarkdown(logs) {
    return renderSummaryTemplate(logs, '- {{TASK}}: {{H}}:{{MIN}}:{{SEC}} ({{COUNT}})');
}
function renderSummaryTemplate(logs, template) {
    const summary = summarizeLogs(logs);
    if (summary.length === 0)
        return '- No logs';
    return summary
        .map((item) => {
        const total = item.totalDurationSec;
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const seconds = total % 60;
        return renderTemplate(template, {
            H: String(hours),
            MIN: String(minutes).padStart(2, '0'),
            SEC: String(seconds).padStart(2, '0'),
            TASK: item.key,
            COUNT: String(item.tasks.length),
            SUMMARY: '',
            LOGS: '',
            RANGE: '',
            YYYY: '',
            MM: '',
            DD: '',
            START: '',
            END: '',
            DURATION: '',
            MEMO: '',
        });
    })
        .join('\n');
}
function renderLogItemsMarkdown(logs, template) {
    return logs
        .map((log) => renderTemplate(template, {
        YYYY: String((0, utils_1.parseStoredDate)(log.startTime)?.getFullYear() ?? new Date().getFullYear()),
        MM: String(((0, utils_1.parseStoredDate)(log.startTime)?.getMonth() ?? new Date().getMonth()) + 1).padStart(2, '0'),
        DD: String((0, utils_1.parseStoredDate)(log.startTime)?.getDate() ?? new Date().getDate()).padStart(2, '0'),
        START: (0, utils_1.formatLocalTime)((0, utils_1.parseStoredDate)(log.startTime) ?? new Date()),
        END: (0, utils_1.formatLocalTime)((0, utils_1.parseStoredDate)(log.endTime) ?? new Date()),
        DURATION: (0, utils_1.formatDuration)(log.durationSec),
        TASK: (0, utils_1.taskPath)(log.task),
        MEMO: log.memo || '',
        SUMMARY: '',
        LOGS: '',
    }))
        .join('\n');
}
function renderTemplate(template, values) {
    return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => values[key] ?? '');
}
function buildExportContent(settings, logs, range) {
    const summary = settings.exportIncludeSummary ? renderSummaryTemplate(logs, settings.exportSummaryTemplate) : '';
    const logItems = settings.exportIncludeLogs ? renderLogItemsMarkdown(logs, settings.exportLogItemTemplate) : '';
    const body = renderTemplate(settings.exportBodyTemplate, {
        SUMMARY: summary,
        LOGS: logItems,
        RANGE: range.label,
    });
    return body.trim();
}
function getSummaryTaskNames(logs) {
    const names = summarizeLogs(logs).map((item) => item.key);
    return names.length > 0 ? names.join(', ') : 'No logs';
}
function getSummaryTotalDuration(logs) {
    const total = logs.reduce((sum, log) => sum + log.durationSec, 0);
    return (0, utils_1.formatDuration)(total);
}
function getSummaryTaskCount(logs) {
    return String(summarizeLogs(logs).length);
}
