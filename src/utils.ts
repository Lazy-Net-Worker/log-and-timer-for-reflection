import { LogEntry, TaskMaster, TaskRef } from './types';

export function nowIso(now = new Date()): string {
	return now.toISOString();
}

export function formatLocalTime(date: Date): string {
	return date.toLocaleTimeString(Intl.DateTimeFormat().resolvedOptions().locale);
}

export function parseStoredDate(value: string | null | undefined): Date | null {
	if (!value) return null;
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

export function makeId(prefix: string): string {
	return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function toTaskRef(task: TaskMaster): TaskRef {
	return {
		id: task.id,
		category: task.category,
		subcategory: task.subcategory,
		name: task.name,
	};
}

export function taskPath(task: TaskRef | TaskMaster): string {
	return [task.category, task.subcategory, task.name].filter(Boolean).join('/');
}

export function formatDuration(sec: number): string {
	const safe = Math.max(0, Math.floor(sec));
	const hours = Math.floor(safe / 3600);
	const minutes = Math.floor((safe % 3600) / 60);
	const seconds = safe % 60;
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDateKey(date: Date): string {
	const date_local = date.toLocaleDateString(Intl.DateTimeFormat().resolvedOptions().locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
	return date_local;
}

export function cloneLog(log: LogEntry): LogEntry {
	return JSON.parse(JSON.stringify(log)) as LogEntry;
}
