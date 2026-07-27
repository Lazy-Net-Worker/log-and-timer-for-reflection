import { AggregatedLog, LogEntry, ExportRangeType, ExportRangeUnit, PluginSettings } from './types';
import { formatDateKey, formatDuration, formatLocalTime, parseStoredDate, taskPath } from './utils';

export interface ExportRange {
	from: Date;
	to: Date;
	label: string;
}

export function resolveExportRange(settings: PluginSettings, referenceDate = new Date()): ExportRange {
	const now = new Date(referenceDate);
	now.setMilliseconds(0);
	const startOfDay = (date: Date) => {
		const copy = new Date(date);
		copy.setHours(0, 0, 0, 0);
		return copy;
	};
	const endOfDay = (date: Date) => {
		const copy = startOfDay(date);
		copy.setDate(copy.getDate() + 1);
		return copy;
	};
	const startOfWeek = (date: Date) => {
		const copy = startOfDay(date);
		const diff = (copy.getDay() - settings.weekStartDay + 7) % 7;
		copy.setDate(copy.getDate() - diff);
		return copy;
	};
	const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
	const startOfYear = (date: Date) => new Date(date.getFullYear(), 0, 1);
	const addUnit = (date: Date, count: number, unit: ExportRangeUnit) => {
		const copy = new Date(date);
		if (unit === 'day') copy.setDate(copy.getDate() + count);
		if (unit === 'week') copy.setDate(copy.getDate() + count * 7);
		if (unit === 'month') copy.setMonth(copy.getMonth() + count);
		if (unit === 'year') copy.setFullYear(copy.getFullYear() + count);
		return copy;
	};
	const parseDate = (value: string): Date | null => {
		const parsed = value ? new Date(value) : null;
		return parsed && !Number.isNaN(parsed.getTime()) ? startOfDay(parsed) : null;
	};
	const rangeType = settings.exportRangeType;

	if (rangeType === 'date-range') {
		const from = parseDate(settings.exportRangeFrom) ?? startOfDay(now);
		const to = parseDate(settings.exportRangeTo) ?? from;
		return { from, to: endOfDay(to), label: `${formatDateKey(from)} - ${formatDateKey(to)}` };
	}
	if (rangeType === 'week-range') {
		const from = parseDate(settings.exportRangeFrom) ?? startOfWeek(now);
		const to = parseDate(settings.exportRangeTo) ?? addUnit(from, 6, 'day');
		return { from, to: endOfDay(to), label: `${formatDateKey(from)} - ${formatDateKey(to)}` };
	}
	if (rangeType === 'month-range') {
		const from = parseDate(settings.exportRangeFrom) ?? startOfMonth(now);
		const to = parseDate(settings.exportRangeTo) ?? new Date(from.getFullYear(), from.getMonth() + 1, 0);
		return { from, to: endOfDay(to), label: `${formatDateKey(from)} - ${formatDateKey(to)}` };
	}
	if (rangeType === 'year-range') {
		const from = parseDate(settings.exportRangeFrom) ?? startOfYear(now);
		const to = parseDate(settings.exportRangeTo) ?? new Date(from.getFullYear(), 11, 31);
		return { from, to: endOfDay(to), label: `${formatDateKey(from)} - ${formatDateKey(to)}` };
	}
	if (rangeType === 'today') return { from: startOfDay(now), to: endOfDay(now), label: formatDateKey(now) };
	if (rangeType === 'days-ago') {
		const from = startOfDay(addUnit(now, -Math.max(0, settings.exportRangeOffset), 'day'));
		return { from, to: endOfDay(from), label: formatDateKey(from) };
	}
	if (rangeType === 'this-week') {
		const from = startOfWeek(now);
		return { from, to: addUnit(from, 7, 'day'), label: `${formatDateKey(from)} - ${formatDateKey(addUnit(from, 6, 'day'))}` };
	}
	if (rangeType === 'weeks-ago') {
		const from = startOfWeek(addUnit(now, -Math.max(0, settings.exportRangeOffset), 'week'));
		return { from, to: addUnit(from, 7, 'day'), label: `${formatDateKey(from)} - ${formatDateKey(addUnit(from, 6, 'day'))}` };
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
	return { from: startOfDay(now), to: endOfDay(now), label: formatDateKey(now) };
}

export function shouldUseDailyNote(rangeType: ExportRangeType): boolean {
	return rangeType === 'today' || rangeType === 'days-ago';
}

export function cloneExportSettings(settings: PluginSettings, rangeType: ExportRangeType): PluginSettings {
	return { ...settings, exportRangeType: rangeType };
}

export function filterLogsByRange(logs: LogEntry[], range: ExportRange): LogEntry[] {
	return logs.filter((log) => {
		const startedAt = parseStoredDate(log.startTime);
		return startedAt ? startedAt >= range.from && startedAt < range.to : false;
	});
}

export function summarizeLogs(logs: LogEntry[]): AggregatedLog[] {
	const groups = new Map<string, AggregatedLog>();
	for (const log of logs) {
		const key = taskPath(log.task);
		const group = groups.get(key) ?? { key, totalDurationSec: 0, tasks: [] };
		group.totalDurationSec += log.durationSec;
		group.tasks.push({ taskPath: taskPath(log.task), durationSec: log.durationSec });
		groups.set(key, group);
	}
	return [...groups.values()].sort((a, b) => b.totalDurationSec - a.totalDurationSec);
}

export function renderSummaryMarkdown(logs: LogEntry[]): string {
	return renderSummaryTemplate(logs, '- {{TASK}}: {{H}}:{{MIN}}:{{SEC}} ({{COUNT}})');
}

export function renderSummaryTemplate(logs: LogEntry[], template: string): string {
	const summary = summarizeLogs(logs);
	if (summary.length === 0) return '- No logs';
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

export function renderLogItemsMarkdown(logs: LogEntry[], template: string): string {
	return logs
		.map((log) =>
			renderTemplate(template, {
				YYYY: String(parseStoredDate(log.startTime)?.getFullYear() ?? new Date().getFullYear()),
				MM: String((parseStoredDate(log.startTime)?.getMonth() ?? new Date().getMonth()) + 1).padStart(2, '0'),
				DD: String(parseStoredDate(log.startTime)?.getDate() ?? new Date().getDate()).padStart(2, '0'),
				START: formatLocalTime(parseStoredDate(log.startTime) ?? new Date()),
				END: formatLocalTime(parseStoredDate(log.endTime) ?? new Date()),
				DURATION: formatDuration(log.durationSec),
				TASK: taskPath(log.task),
				MEMO: log.memo || '',
				SUMMARY: '',
				LOGS: '',
			}),
		)
		.join('\n');
}

export function renderTemplate(template: string, values: Record<string, string>): string {
	return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key: string) => values[key] ?? '');
}

export function buildExportContent(settings: PluginSettings, logs: LogEntry[], range: ExportRange): string {
	const summary = settings.exportIncludeSummary ? renderSummaryTemplate(logs, settings.exportSummaryTemplate) : '';
	const logItems = settings.exportIncludeLogs ? renderLogItemsMarkdown(logs, settings.exportLogItemTemplate) : '';
	const body = renderTemplate(settings.exportBodyTemplate, {
		SUMMARY: summary,
		LOGS: logItems,
		RANGE: range.label,
	});
	return body.trim();
}

export function getSummaryTaskNames(logs: LogEntry[]): string {
	const names = summarizeLogs(logs).map((item) => item.key);
	return names.length > 0 ? names.join(', ') : 'No logs';
}

export function getSummaryTotalDuration(logs: LogEntry[]): string {
	const total = logs.reduce((sum, log) => sum + log.durationSec, 0);
	return formatDuration(total);
}

export function getSummaryTaskCount(logs: LogEntry[]): string {
	return String(summarizeLogs(logs).length);
}
